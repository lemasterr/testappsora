
import fs from 'fs/promises';
import { Page, ElementHandle } from 'puppeteer-core';
import { logInfo, logError } from '../logging/logger';
import { getConfig } from '../config/config';
import { Session } from '../sessions/types';
import { startTask, stopTask } from './taskRegistry';
import { getSessionPaths } from '../sessions/repo';
import { getSessionPage, registerSessionPage } from './selectorInspector';
import { ensureBrowserForSession } from './sessionChrome';

async function findElement(page: Page, selector: string, timeout = 10000): Promise<ElementHandle<Element> | null> {
    try {
        return await page.waitForSelector(selector, { timeout, visible: true });
    } catch {
        return null;
    }
}

async function readLines(filePath: string): Promise<string[]> {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return data.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    } catch {
        return [];
    }
}

export async function runGenericPromptLoop(
    session: Session,
    inputSelectorId?: string,
    submitSelectorId?: string,
    onStatus?: (msg: string, status?: 'running' | 'warning') => void
): Promise<{ ok: boolean; message: string; submittedCount?: number }> {
    const signal = startTask(session.id, 'prompts');
    const config = await getConfig();
    
    // Resolve selectors
    const inputSel = config.universalSelectors?.find(s => s.id === inputSelectorId);
    const submitSel = config.universalSelectors?.find(s => s.id === submitSelectorId);

    if (!inputSel || !submitSel) {
        return { ok: false, message: 'Invalid selector configuration' };
    }

    const report = (msg: string) => {
        if (onStatus) onStatus(msg, 'running');
        else logInfo('GenericLoop', `[${session.name}] ${msg}`);
    };

    let page: Page | null = getSessionPage(session.id);
    let submittedCount = 0;

    try {
        if (!page) {
            report('Reconnecting browser...');
            const res = await ensureBrowserForSession(session);
            const pages = await res.browser.pages();
            page = pages[0];
            registerSessionPage(session.id, page);
        }

        if (!page) throw new Error('Browser page unavailable');

        const paths = await getSessionPaths(session);
        const prompts = await readLines(paths.promptsFile);
        
        if (prompts.length === 0) return { ok: true, message: 'No prompts found', submittedCount: 0 };

        report(`Starting loop: ${prompts.length} prompts`);

        for (let i = 0; i < prompts.length; i++) {
            if (signal.aborted) break;
            
            const prompt = prompts[i];
            report(`Processing prompt ${i + 1}/${prompts.length}...`);

            // 1. Find Input
            const inputHandle = await findElement(page, inputSel.cssSelector);
            if (!inputHandle) throw new Error(`Input element not found: ${inputSel.label}`);

            // 2. Clear & Type
            await inputHandle.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            // Force clear value via DOM for robustness
            await page.evaluate((el) => { (el as HTMLInputElement).value = ''; }, inputHandle);
            await inputHandle.type(prompt, { delay: config.soraTimings?.humanTypingDelayMs || 10 });
            await new Promise(r => setTimeout(r, 500));

            // 3. Find Submit
            const submitHandle = await findElement(page, submitSel.cssSelector);
            if (!submitHandle) throw new Error(`Submit element not found: ${submitSel.label}`);

            // 4. Click
            await submitHandle.click();
            submittedCount++;
            
            // Mark done in memory (we overwrite file at end)
            prompts[i] = '';

            // 5. Wait
            const delay = session.promptDelayMs || 5000;
            report(`Waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }

        // Save remaining
        const remaining = prompts.filter(p => p.length > 0);
        await fs.writeFile(paths.promptsFile, remaining.join('\n'), 'utf-8');

        return { ok: true, message: `Generic loop finished. Submitted: ${submittedCount}`, submittedCount };

    } catch (e) {
        logError('GenericLoop', `Error: ${(e as Error).message}`);
        return { ok: false, message: (e as Error).message };
    } finally {
        stopTask(session.id);
    }
}
