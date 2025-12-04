
import { Page, ElementHandle } from 'puppeteer-core';
import { logInfo, logError } from '../logging/logger';
import { GenericActionType } from '../../shared/types';
import { getConfig } from '../config/config';

// Robust find with timeout and visibility check
async function findElement(page: Page, selector: string, timeout = 10000): Promise<ElementHandle<Element> | null> {
    try {
        const handle = await page.waitForSelector(selector, { timeout, visible: true });
        return handle;
    } catch {
        return null;
    }
}

export async function runGenericStep(
    page: Page, 
    action: GenericActionType, 
    selectorId: string | undefined, 
    value: string | undefined
): Promise<{ ok: boolean; message?: string }> {
    
    const config = await getConfig();
    let cssSelector = '';
    let selectorLabel = 'Unknown';

    // 1. Resolve Selector if provided
    if (selectorId) {
        const selObj = config.universalSelectors?.find(s => s.id === selectorId);
        if (selObj) {
            cssSelector = selObj.cssSelector;
            selectorLabel = selObj.label;
        }
    }

    // 2. Validation
    // Actions that absolutely require a DOM element
    if ((action === 'click' || action === 'type' || action === 'scroll') && !cssSelector) {
        return { ok: false, message: `Action "${action}" requires a valid selector. Please pick one.` };
    }

    // Navigate requires a URL
    if (action === 'navigate' && !value) {
        return { ok: false, message: 'Navigate action requires a URL value.' };
    }

    logInfo('GenericStep', `Executing ${action} on "${selectorLabel}" (${cssSelector || 'N/A'})`);

    try {
        switch (action) {
            case 'click': {
                const handle = await findElement(page, cssSelector);
                if (!handle) throw new Error(`Element "${selectorLabel}" not found (${cssSelector})`);
                await handle.click({ delay: 50 });
                return { ok: true, message: `Clicked ${selectorLabel}` };
            }

            case 'type': {
                const handle = await findElement(page, cssSelector);
                if (!handle) throw new Error(`Element "${selectorLabel}" not found (${cssSelector})`);
                
                // Clear first (Standard behavior for automation)
                await handle.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                
                const textToType = value || '';
                await handle.type(textToType, { delay: 30 });
                return { ok: true, message: `Typed "${textToType}" into ${selectorLabel}` };
            }

            case 'wait': {
                // Priority: Wait for Selector > Wait for Time
                if (cssSelector) {
                    const found = await findElement(page, cssSelector, 30000); // 30s timeout
                    if (!found) throw new Error(`Timeout waiting for "${selectorLabel}"`);
                    return { ok: true, message: `Waited for ${selectorLabel}` };
                } else if (value && !isNaN(Number(value))) {
                    const ms = Number(value);
                    logInfo('GenericStep', `Waiting ${ms}ms...`);
                    await new Promise(r => setTimeout(r, ms));
                    return { ok: true, message: `Waited ${ms}ms` };
                }
                return { ok: false, message: 'Wait requires a Selector OR a Time (ms)' };
            }

            case 'navigate': {
                await page.goto(value!, { waitUntil: 'domcontentloaded' });
                return { ok: true, message: `Navigated to ${value}` };
            }
            
            case 'scroll': {
                const handle = await findElement(page, cssSelector);
                if (!handle) throw new Error(`Element "${selectorLabel}" not found`);
                await handle.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                await new Promise(r => setTimeout(r, 500));
                return { ok: true, message: `Scrolled to ${selectorLabel}` };
            }

            default:
                return { ok: false, message: `Unknown action: ${action}` };
        }
    } catch (e) {
        const err = e as Error;
        logError('GenericStep', `Action failed: ${err.message}`);
        return { ok: false, message: err.message };
    }
}
