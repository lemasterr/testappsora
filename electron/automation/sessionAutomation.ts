
import fs from 'fs/promises';
import path from 'path';
import type { Browser, Page, ElementHandle } from 'puppeteer-core';
import type { RunResult } from '../../shared/types';
import { pages } from '../../core/config/pages';
import { selectors } from '../../core/selectors/selectors';
import { newPage } from './chromeController';
import { getOrLaunchChromeForProfile } from '../chrome/manager';
import { resolveSessionCdpPort } from '../utils/ports';
import { resolveChromeProfileForSession, type ChromeProfile } from '../chrome/profiles';
import { logError, logInfo, logWarn } from '../logging/logger';
import { getSessionPaths } from '../sessions/repo';
import { getConfig } from '../config/config';
import type { Session } from '../sessions/types';
import { startTask, stopTask } from './taskRegistry';
import { sendTelegramMessage } from '../integrations/telegram';
import { pythonRecordEvent } from '../integrations/pythonClient';

export type PromptsRunResult = RunResult;

const PAGE_LOAD_DELAY = 5000; 
const CONCURRENT_WAIT_MS = 90_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeDisconnect(browser: Browser | null): Promise<void> {
    if (browser) {
        try { await browser.disconnect(); } catch {}
    }
}

async function resolveProfileForContext(sessionName: string, sessionId: string): Promise<ChromeProfile> {
  const config = await getConfig();
  const profile = await resolveChromeProfileForSession({ 
      chromeProfileName: config.chromeActiveProfileName,
      sessionId: sessionId 
  });
  if (profile) return profile;
  throw new Error('No Chrome profile available. Select a Chrome profile in Settings.');
}

async function getOrLaunchBrowser(session: Session): Promise<{ browser: Browser }> {
  const config = await getConfig();
  const profile = await resolveProfileForContext(session.name, session.id);
  const basePort = config.cdpPort ?? 9222;
  const port = resolveSessionCdpPort(session, basePort);
  
  logInfo('Prompts', `Connecting to ${session.name} on port ${port}`);
  
  const browser = await getOrLaunchChromeForProfile(profile, port, session.id);
  return { browser };
}

async function readLines(filePath: string): Promise<string[]> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return data.split(/\r?\n/);
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendLog(filePath: string, message: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${message}\n`, 'utf-8');
  } catch {}
}

const ROBUST_SELECTORS = {
  PROMPT_INPUT: [
    selectors.promptInput,
    'textarea[data-testid="prompt-input"]',
    '//textarea[contains(@placeholder, "Describe")]',
    'textarea[aria-label="Prompt"]',
    '#prompt-textarea',
    'div[contenteditable="true"]'
  ],
  SUBMIT_BUTTON: [
    selectors.submitButton,
    'button[data-testid="submit"]',
    'button:has(svg)',
    '//button[contains(text(), "Generate")]',
    'button[aria-label="Send prompt"]'
  ],
  LOGIN_CHECK: [
    'button[data-testid="login-button"]',
    'a[href*="/login"]',
    '//button[contains(text(), "Log in")]'
  ],
  FILE_INPUT: [
    selectors.fileInput,
    'input[type="file"]'
  ]
};

async function findSubmitButtonHeuristic(page: Page, textareaHandle: ElementHandle<Element>): Promise<ElementHandle<Element> | null> {
  try {
    const handle = await page.evaluateHandle((ta: any) => {
      if (!ta) return null;
      let container = ta.parentElement;
      while (container && container.tagName !== 'BODY') {
        if (container.tagName === 'FORM' || container.classList.contains('flex') || container.classList.contains('grid')) {
          if (container.clientHeight > 50) break; 
        }
        container = container.parentElement;
      }
      if (!container) container = document.body;

      const buttons = Array.from(container.querySelectorAll('button')) as any[];
      const candidates = [];
      const taRect = ta.getBoundingClientRect();
      const taCenterY = taRect.top + taRect.height / 2;

      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        if (!btn.querySelector('svg')) continue;
        const text = (btn.textContent || '').toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (text.includes('add') || label.includes('add') || label.includes('attach')) continue;
        const btnCenterY = rect.top + rect.height / 2;
        if (Math.abs(btnCenterY - taCenterY) > 300) continue; 
        if (rect.width > 300 || rect.height > 300) continue;
        candidates.push({ btn, rect });
      }

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.rect.left - a.rect.left);
      return candidates[0].btn;
    }, textareaHandle);

    const element = handle.asElement();
    if (element) {
      return element as ElementHandle<Element>;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function findFirstVisible(page: Page, candidates: string[], timeout = 2000): Promise<ElementHandle<Element> | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const selector of candidates) {
      try {
        let handle: ElementHandle<Element> | null = null;
        if (selector.startsWith('//')) {
          const handleJS = await page.evaluateHandle((xpath) => {
            const result = document.evaluate(xpath as string, document, null, 9, null);
            return result.singleNodeValue;
          }, selector);
          const element = handleJS.asElement();
          if (element) handle = element as ElementHandle<Element>;
          else await handleJS.dispose();
        } else {
          handle = await page.$(selector);
        }

        if (handle) {
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            try { await handle.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); }); } catch {}
            return handle;
          }
          await handle.dispose();
        }
      } catch (e) { }
    }
    await delay(200);
  }
  return null;
}

type WarningType = 'concurrent' | 'daily' | null;

async function checkWarnings(page: Page): Promise<WarningType> {
    const alertSelectors = [
        'div[role="alert"]',
        '.text-red-500', 
        '.text-token-text-primary',
        'div:has(> svg.text-red-500)',
        '.bg-token-main-surface-primary'
    ];
    
    let text = "";
    
    for (const sel of alertSelectors) {
        try {
            const elements = await page.$$(sel);
            for (const el of elements) {
                const content = await page.evaluate(e => e.textContent, el);
                if (content) text += content + " ";
            }
        } catch {}
    }

    if (!text || text.length < 10) {
        text = await page.evaluate(() => document.body.innerText).catch(() => "") as string;
    }
    
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('daily limit') || lowerText.includes('come back tomorrow')) {
        return 'daily';
    }

    if (lowerText.includes('concurrent') || lowerText.includes('too many requests')) {
        return 'concurrent';
    }

    return null;
}

export async function runPromptsAdapter(
    session: Session, 
    maxVideos?: number,
    onStatus?: (msg: string, status?: 'running' | 'warning') => void
): Promise<{ ok: boolean; message: string; submittedCount?: number }> {
    const signal = startTask(session.id, 'prompts');
    const paths = await getSessionPaths(session);
    const config = await getConfig();

    let browser: Browser | null = null;
    let submittedCount = 0;
    let failedCount = 0;
    let stopReason: string | null = null;

    const report = (msg: string, status?: 'running' | 'warning') => {
        if (onStatus) onStatus(msg, status || 'running');
        else logInfo('Prompts', `[${session.name}] ${msg}`);
    };

    try {
        logInfo('Prompts', `Reading prompts from: ${paths.promptsFile}`);
        const prompts = await readLines(paths.promptsFile);
        const activePrompts = prompts.filter(p => p.trim().length > 0);
        const imagePrompts = await readLines(paths.imagePromptsFile);

        if (activePrompts.length === 0) {
            return { ok: true, message: 'No prompts found in list.', submittedCount: 0 };
        }

        report(`Launching browser for ${activePrompts.length} prompts...`);
        sendTelegramMessage(`🚀 Starting Prompts for ${session.name}. Queue: ${activePrompts.length}`);

        if (signal.aborted) throw new Error('Cancelled');

        const res = await getOrLaunchBrowser(session);
        browser = res.browser;

        const pagesList = await browser.pages();
        let page = pagesList.find(p => !p.url().startsWith('devtools'));
        if (!page) page = await newPage(browser);

        if (!page.url().includes('sora.chatgpt.com')) {
            await page.goto(pages.baseUrl, { waitUntil: 'domcontentloaded' });
        }

        report(`Waiting ${PAGE_LOAD_DELAY}ms for stabilization...`);
        await delay(PAGE_LOAD_DELAY);

        const batchSize = session.maxPromptsPerRun || 2; 
        const batchDelay = session.postLastPromptDelayMs || 120_000; 

        for (let i = 0; i < prompts.length; i++) {
            if (signal.aborted) break;

            const promptText = (prompts[i] ?? '').trim();
            if (!promptText) continue;
            
            if (maxVideos && maxVideos > 0 && submittedCount >= maxVideos) break;

            if (submittedCount > 0 && submittedCount % batchSize === 0) {
                const waitSec = Math.round(batchDelay / 1000);
                report(`Batch pause: Waiting ${waitSec}s...`, 'warning');
                logInfo('Prompts', `Batch of ${batchSize} completed. Pausing for ${waitSec}s...`);
                sendTelegramMessage(`⏳ Batch Cooldown: Waiting ${waitSec}s in ${session.name}`);
                await delay(batchDelay);
                if (signal.aborted) break;
            }

            const imagePath = (imagePrompts[i] ?? '').trim();

            try {
                report(`Submitting prompt ${submittedCount + 1}...`);
                const loginBtn = await findFirstVisible(page, ROBUST_SELECTORS.LOGIN_CHECK, 1000);
                if (loginBtn) throw new Error("Not Logged In. Please log in to Sora manually.");

                const inputEl = await findFirstVisible(page, ROBUST_SELECTORS.PROMPT_INPUT, 20000);
                if (!inputEl) throw new Error("Prompt input not found (timeout).");
                
                if (signal.aborted) break;

                await inputEl.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.evaluate((el) => { (el as HTMLTextAreaElement).value = ''; }, inputEl);
                await inputEl.type(promptText, { delay: config.soraTimings?.humanTypingDelayMs || 12 });

                if (imagePath) {
                    const input = await findFirstVisible(page, ROBUST_SELECTORS.FILE_INPUT, 2000);
                    if (input) await (input as ElementHandle<HTMLInputElement>).uploadFile(imagePath);
                }

                if (signal.aborted) break;

                let btn = await findSubmitButtonHeuristic(page, inputEl);
                if (!btn) btn = await findFirstVisible(page, ROBUST_SELECTORS.SUBMIT_BUTTON, 5000);
                if (!btn) throw new Error("Submit button not found");
                
                await btn.click();
                await delay(2500);
                
                const currentValue = await page.evaluate((el) => (el as HTMLTextAreaElement).value, inputEl);
                
                if (currentValue && currentValue.trim().length > 0) {
                    const warning = await checkWarnings(page);
                    
                    if (warning === 'concurrent') {
                        const waitTime = CONCURRENT_WAIT_MS / 1000;
                        const msg = `Concurrent Limit (3/3). Waiting ${waitTime}s...`;
                        report(msg, 'warning');
                        logWarn('Prompts', `Concurrent limit detected. Pausing...`);
                        sendTelegramMessage(`⚠️ Concurrent Limit in ${session.name}. Pausing ${waitTime}s.`);
                        await delay(CONCURRENT_WAIT_MS);
                        i--; // Retry
                        continue;
                    } 
                    
                    if (warning === 'daily') {
                        stopReason = 'Daily Limit Reached';
                        report('Daily limit reached. Stopping.', 'warning');
                        logWarn('Prompts', 'Daily limit reached. Stopping session.');
                        sendTelegramMessage(`🛑 Daily Limit Reached for ${session.name}`);
                        break;
                    }

                    throw new Error("Submit clicked but text remained. Unknown error.");
                }

                submittedCount++;
                await appendLog(paths.submittedLog, `${new Date().toISOString()} | OK | ${promptText.slice(0, 50)}`);
                prompts[i] = ''; // Mark as done
                
                pythonRecordEvent('prompt', session.id, { prompt: promptText });

                await delay(config.promptDelayMs || 2000);

            } catch (error) {
                if (signal.aborted) break;
                failedCount++;
                const err = error as Error;
                const errMsg = err.message;
                const stack = err.stack || '';
                
                logError('Prompts', `Failed prompt: ${errMsg}`);
                report(`Error: ${errMsg.slice(0, 30)}...`);
                
                pythonRecordEvent('error', session.id, { error: errMsg, context: 'prompts' });
                sendTelegramMessage(`❌ Prompt Failed [${session.name}]: ${errMsg}`);

                const logEntry = [
                    '----------------------------------------',
                    `TIMESTAMP: ${new Date().toISOString()}`,
                    `PROMPT: ${promptText}`,
                    `ERROR: ${errMsg}`,
                    `STACK: ${stack}`,
                    '----------------------------------------'
                ].join('\n');
                
                await appendLog(paths.failedLog, logEntry);
                
                if (errMsg.includes('Not Logged In')) throw error;
            }

            if (signal.aborted) break;
            await delay(config.soraTimings?.pollIntervalMs || 1200);
        }

        const remaining = prompts.filter(p => p.trim().length > 0);
        await fs.writeFile(paths.promptsFile, remaining.join('\n'), 'utf-8');

        let msg = `Submitted ${submittedCount} prompts`;
        if (stopReason) {
            msg = `Stopped: ${stopReason} (Submitted ${submittedCount})`;
        } else if (signal.aborted) {
            msg = 'Cancelled';
        } else if (submittedCount === 0 && failedCount > 0) {
            msg = 'All prompts failed';
        }

        if (submittedCount > 0) {
            sendTelegramMessage(`✅ Prompts Finished [${session.name}]. Submitted: ${submittedCount}. Failed: ${failedCount}`);
        }

        return { 
            ok: true, 
            message: msg,
            submittedCount
        };

    } catch (error) {
        const err = (error as Error).message;
        logError('Prompts', `Run failed: ${err}`);
        sendTelegramMessage(`❌ Session Run Crashed [${session.name}]: ${err}`);
        return { ok: false, message: err };
    } finally {
        stopTask(session.id);
        await safeDisconnect(browser);
    }
}

export const runPrompts = runPromptsAdapter;
export const cancelSessionRun = stopTask;
