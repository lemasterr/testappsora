
import fs from 'fs/promises';
import path from 'path';
import { type Browser, type Page } from 'puppeteer-core';
import { pages } from '../../core/config/pages';
import { runDownloadLoop } from '../../core/download/downloadFlow';
import { selectors, waitForVisible } from '../../core/selectors/selectors';

import { getConfig, type Config } from '../config/config';
import { getSessionPaths } from '../sessions/repo';
import type { Session } from '../sessions/types';
import { startWatchdog, stopWatchdog, heartbeat } from './watchdog';
import { registerSessionPage, unregisterSessionPage } from './selectorInspector';
import { runPostDownloadHook } from './hooks';
import { ensureDir } from '../utils/fs';
import { logInfo, logError } from '../logging/logger';
import { ensureBrowserForSession } from './sessionChrome';
import { startTask, stopTask } from './taskRegistry';
import { sendTelegramMessage, sendTelegramVideo } from '../integrations/telegram';
import { pythonRecordEvent } from '../integrations/pythonClient';

export type DownloadRunResult = {
  ok: boolean;
  downloaded: number;
  errorCode?: string;
  error?: string;
};

const WATCHDOG_TIMEOUT_MS = 120_000;
const MAX_WATCHDOG_RESTARTS = 2;

async function readLines(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw.split(/\r?\n/).map((line) => line.trim());
  } catch (error) {
    if ((error as Error & { code?: string })?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function safeFileName(title: string): string {
  const sanitized = title.replace(/[\\/:*?"<>|]/g, '_');
  return sanitized.length > 80 ? sanitized.slice(0, 80) : sanitized;
}

async function disconnectIfExternal(browser: Browser | null): Promise<void> {
  if (!browser) return;
  try { await browser.disconnect(); } catch {}
}

async function configureDownloads(page: Page, downloadsDir: string): Promise<void> {
  await ensureDir(downloadsDir);
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadsDir });
}

async function preparePage(browser: Browser, downloadDir: string): Promise<Page> {
  const context = browser.browserContexts()[0] ?? browser.defaultBrowserContext();
  const pagesList = await context.pages();
  const existing = pagesList.find((p) => p.url().includes('sora.chatgpt.com'));
  const page = existing ?? (await context.newPage());

  await configureDownloads(page, downloadDir);
  
  if (!page.url().includes('sora.chatgpt.com')) {
    await page.goto(pages.draftsUrl, { waitUntil: 'networkidle2' });
  }
  
  return page;
}

export async function runDownloads(
  session: Session,
  maxVideos = 0
): Promise<DownloadRunResult> {
  const signal = startTask(session.id, 'download');
  const runId = `download:${session.id}:${Date.now()}`;
  
  let browser: Browser | null = null;
  let page: Page | null = null;
  let downloadedInThisRun = 0;
  let watchdogTimeouts = 0;
  let fatalWatchdog = false;

  try {
    const [config, paths] = await Promise.all([getConfig(), getSessionPaths(session)]);
    const titles = await readLines(paths.titlesFile);

    await ensureDir(paths.downloadDir);
    const existingFiles = await fs.readdir(paths.downloadDir).catch(() => []);
    const mp4Count = existingFiles.filter(f => f.toLowerCase().endsWith('.mp4')).length;
    
    const explicitCap = Number.isFinite(maxVideos) && maxVideos > 0 ? maxVideos : 0;
    const targetTotal = explicitCap > 0 ? explicitCap : (session.maxVideos || 1000);

    logInfo('Downloader', `Session ${session.name}: Found ${mp4Count} existing videos. Target: ${targetTotal}.`);

    if (mp4Count >= targetTotal) {
        logInfo('Downloader', 'Target download count already reached. Skipping download phase.');
        return { ok: true, downloaded: 0 };
    }

    sendTelegramMessage(`📥 Starting downloads for ${session.name}. Target: ${targetTotal - mp4Count} new videos.`);

    const { browser: connected } = await ensureBrowserForSession(session, config);
    browser = connected;

    if (signal.aborted) throw new Error('Cancelled');

    page = await preparePage(browser, paths.downloadDir);
    registerSessionPage(session.id, page);
    heartbeat(runId);

    const onTimeout = async () => {
      watchdogTimeouts++;
      logError('Downloader', `Watchdog timeout (${watchdogTimeouts}/${MAX_WATCHDOG_RESTARTS})`);
      sendTelegramMessage(`⚠️ Watchdog Timeout in ${session.name}. Restarting loop...`);
      if (watchdogTimeouts >= MAX_WATCHDOG_RESTARTS) {
        fatalWatchdog = true;
        stopTask(session.id);
      }
    };
    startWatchdog(runId, WATCHDOG_TIMEOUT_MS, onTimeout);

    if (page) {
        await waitForVisible(page, selectors.cardItem).catch(() => undefined);
        
        const loopResult = await runDownloadLoop({
            page,
            maxDownloads: targetTotal,
            downloadDir: paths.downloadDir,
            waitForReadySelectors: [selectors.rightPanel],
            downloadButtonSelector: selectors.downloadButton,
            onStateChange: () => heartbeat(runId),
            isCancelled: () => signal.aborted || fatalWatchdog,
            maxSeenFiles: existingFiles.length + 100,
            skipCount: mp4Count
        });

        for (let index = 0; index < loopResult.savedFiles.length; index++) {
            const savedPath = loopResult.savedFiles[index];
            const titleIndex = mp4Count + index; 
            
            const titleFromList = titles[titleIndex] || '';
            const titlePage = (await page.title()) || '';
            const title = titleFromList || titlePage || `video_${titleIndex + 1}`;

            const targetName = `${safeFileName(title)}.mp4`;
            const targetPath = path.join(paths.downloadDir, targetName);
            
            if (savedPath !== targetPath) {
                try { await fs.rename(savedPath, targetPath); } catch {}
            }

            const finalPath = await fs.access(targetPath).then(() => targetPath).catch(() => savedPath);
            await runPostDownloadHook(finalPath, title);
            
            logInfo('Downloader', `Saved: ${targetName}`);
            
            // ANALYTICS & TELEGRAM
            pythonRecordEvent('download_success', session.id, { file: targetName, title });

            if (config.telegram?.enabled) {
                sendTelegramVideo(finalPath, `✅ Downloaded: ${title}\nSession: ${session.name}`).catch(e => {
                    logError('Telegram', `Failed to send video: ${e.message}`);
                });
            }

            heartbeat(runId);
        }
        
        downloadedInThisRun = loopResult.completed;
    }

    return { 
        ok: !fatalWatchdog && !signal.aborted, 
        downloaded: downloadedInThisRun, 
        error: fatalWatchdog ? 'Watchdog Timeout' : (signal.aborted ? 'Cancelled' : undefined) 
    };

  } catch (error) {
    const msg = (error as Error).message;
    sendTelegramMessage(`❌ Download Error in ${session.name}: ${msg}`);
    pythonRecordEvent('error', session.id, { error: msg, context: 'downloader' });
    return { ok: false, downloaded: downloadedInThisRun, error: msg };
  } finally {
    stopWatchdog(runId);
    stopTask(session.id);
    unregisterSessionPage(session.id, page);
    await disconnectIfExternal(browser);
  }
}

export function cancelDownloads(sessionId: string): void {
  stopTask(sessionId);
}
