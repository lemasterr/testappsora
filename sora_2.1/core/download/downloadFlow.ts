import fs from 'fs/promises';
import path from 'path';
import type { Page } from 'puppeteer-core';

import { selectors, waitForVisible } from '../selectors/selectors';
import { logError, logStep } from '../utils/log';

const DOWNLOAD_MENU_LABELS = ['Download', 'Скачать', 'Download video', 'Save video', 'Export'];

const READY_TIMEOUT_MS = 15_000;
const DOWNLOAD_START_TIMEOUT_MS = 30_000;
const FILE_SAVE_TIMEOUT_MS = 60_000;
const POST_DOWNLOAD_WAIT_MS = 2000; // 2 seconds wait after download before swipe

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDownloadStart(
  downloadDir: string,
  seenNames: Set<string>,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const entries = await fs.readdir(downloadDir);
      const candidate = entries.find((name) => !seenNames.has(name));
      if (candidate) {
        return path.join(downloadDir, candidate);
      }
    } catch {
      // ignore polling errors
    }
    await delay(300);
  }

  throw new Error('Download did not start before timeout');
}

async function waitUntilFileSaved(
  downloadDir: string,
  startedAt: number,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let newest: string | null = null;

  while (Date.now() < deadline) {
    try {
      const entries = await fs.readdir(downloadDir);
      const mp4s = await Promise.all(
        entries
          .filter((name) => name.toLowerCase().endsWith('.mp4'))
          .map(async (name) => {
            const full = path.join(downloadDir, name);
            const stats = await fs.stat(full);
            return { full, stats };
          })
      );

      const candidate = mp4s
        .filter((entry) => entry.stats.mtimeMs >= startedAt)
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)[0];

      if (candidate) {
        // Double check size to ensure it's not 0 bytes
        if (candidate.stats.size > 0) {
            newest = candidate.full;
            break;
        }
      }
    } catch {
      // ignore polling errors
    }

    await delay(500);
  }

  if (!newest) {
    throw new Error('Download file not saved before timeout');
  }

  return newest;
}

/**
 * Logic to open a specific card index (e.g., skip first 5, open 6th).
 * Handles scrolling if the card is not yet in the DOM (lazy loading).
 */
async function openCardAtIndex(page: Page, index: number): Promise<void> {
  logStep(`Opening card at index ${index + 1} (skipping ${index})...`);

  // Force scroll to top first
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(500);

  // We loop to find the card, scrolling down if needed
  const MAX_SCROLL_ATTEMPTS = 10;
  
  for (let attempt = 0; attempt < MAX_SCROLL_ATTEMPTS; attempt++) {
    await waitForVisible(page, selectors.cardItem, READY_TIMEOUT_MS);
    const cards = await page.$$(selectors.cardItem);
    
    if (index < cards.length) {
      // Found target card
      const targetCard = cards[index];
      
      // Scroll it into view smoothly
      await targetCard.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await delay(500);
      
      // Click
      await targetCard.click({ delay: 100 });
      
      // Wait for panel
      try {
        await waitForVisible(page, selectors.rightPanel, READY_TIMEOUT_MS);
        return;
      } catch {
        // If failed, might need a retry or delay
        await delay(1000);
        await waitForVisible(page, selectors.rightPanel, READY_TIMEOUT_MS);
        return;
      }
    }

    // Not found yet, scroll down to load more
    logStep(`Card ${index + 1} not visible (found ${cards.length}), scrolling...`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await delay(1500); // Wait for hydration
  }

  throw new Error(`Could not find card at index ${index} after scrolling`);
}

/**
 * Safe Swipe: Simulates a touch/mouse drag from the center of the video upwards.
 * Avoids clicking "X" buttons or black bars by strictly calculating the viewport center.
 */
async function performSafeSwipe(page: Page): Promise<void> {
  // Try to find the main video container to locate center
  // Fallback to window center if container not found
  const viewport = await page.viewport();
  const width = viewport?.width || 1280;
  const height = viewport?.height || 720;

  const centerX = width / 2;
  const centerY = height / 2;

  // Move mouse to center (safe zone)
  await page.mouse.move(centerX, centerY);
  
  // Drag Gesture: Down -> Move Up -> Up
  await page.mouse.down();
  // Move up by ~40% of screen height to trigger swipe
  await page.mouse.move(centerX, centerY - (height * 0.4), { steps: 10 }); 
  await page.mouse.up();

  // Wait for animation transition
  await delay(800);
}

async function ensureKebabMenu(page: Page): Promise<void> {
  const kebab = await page.$(selectors.kebabInRightPanel);
  if (!kebab) {
    throw new Error('Download menu button not found in right panel');
  }

  // Hover first to ensure UI responsiveness
  const box = await kebab.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await delay(150);
  }

  await kebab.click({ delay: 80 });
  await waitForVisible(page, selectors.menuRoot, 8_000);
}

async function clickDownload(page: Page, downloadButtonSelector: string): Promise<void> {
  // 1. Try direct download button (if visible)
  const direct = await page.$(downloadButtonSelector);
  if (direct && await direct.isVisible()) {
    await direct.click({ delay: 80 });
    return;
  }

  // 2. Fallback to Kebab Menu
  await ensureKebabMenu(page);
  const menuRoot = await page.$(selectors.menuRoot);
  if (!menuRoot) {
    throw new Error('Download menu root not found');
  }

  // 3. Look for download option in menu
  // Some versions have a button with data-testid="download" inside the menu
  const directInMenu = await menuRoot.$(downloadButtonSelector);
  if (directInMenu) {
    await directInMenu.click({ delay: 80 });
    return;
  }

  // 4. Text-based search in menu items
  const items = await menuRoot.$$(selectors.menuItem);
  if (!items.length) {
    throw new Error('No menu items found in download menu');
  }

  let candidate: any | null = null;
  for (const item of items) {
    const text = (await page.evaluate((el) => el.textContent ?? '', item)).trim();
    if (DOWNLOAD_MENU_LABELS.some((label) => text.toLowerCase().includes(label.toLowerCase()))) {
      candidate = item;
      break;
    }
  }

  if (!candidate) {
    // Last resort: click first item
    candidate = items[0];
  }

  await candidate.click({ delay: 80 });
}

async function waitUntilCardReady(page: Page, waitForReadySelectors: string[]): Promise<void> {
  const readySelectors = waitForReadySelectors.length ? waitForReadySelectors : [selectors.rightPanel];
  for (const selector of readySelectors) {
    await waitForVisible(page, selector, READY_TIMEOUT_MS);
  }
  await delay(250);
}

export enum DownloadState {
  Idle,
  OpenCard,
  WaitCardReady,
  StartDownload,
  WaitDownloadStart,
  WaitFileSaved,
  PostDownloadDelay,
  SwipeNext,
  Done,
}

export type DownloadLoopResult = {
  completed: number;
  savedFiles: string[];
  lastState: DownloadState;
};

export async function runDownloadLoop(options: {
  page: Page;
  maxDownloads: number;
  downloadDir: string;
  waitForReadySelectors: string[];
  downloadButtonSelector: string;
  onStateChange?: (state: DownloadState) => void;
  isCancelled?: () => boolean;
  maxSeenFiles?: number;
  skipCount?: number; // Number of items to skip from the feed (resuming)
}): Promise<DownloadLoopResult> {
  const { 
    page, maxDownloads, downloadDir, waitForReadySelectors, 
    downloadButtonSelector, onStateChange, isCancelled, skipCount = 0 
  } = options;

  let state: DownloadState = DownloadState.Idle;
  const savedFiles: string[] = [];
  
  // Total target is user limit. We have already done `skipCount`.
  // We need to download `maxDownloads - skipCount` more files.
  // Actually, maxDownloads passed here is usually the *total limit* for the session.
  // But the loop controls how many NEW files we download.
  
  await fs.mkdir(downloadDir, { recursive: true });

  const notify = (next: DownloadState) => {
    state = next;
    onStateChange?.(state);
    logStep(`Download state: ${DownloadState[state]}`);
  };

  // 1. Open the specific card (Resuming logic)
  notify(DownloadState.OpenCard);
  try {
    await openCardAtIndex(page, skipCount);
  } catch (error) {
    logError('Failed to open initial card', error);
    throw error;
  }

  const MAX_SEEN = options.maxSeenFiles ?? 1000;
  const initialFiles = await fs.readdir(downloadDir).catch(() => []);
  const seenNames = new Set<string>(initialFiles.slice(-MAX_SEEN));

  // Determine how many we still need to download
  const videosToDownload = Math.max(0, maxDownloads - skipCount);
  logStep(`Resuming session. Skipped ${skipCount}. Target download: ${videosToDownload} new videos.`);

  while (savedFiles.length < videosToDownload) {
    if (isCancelled?.()) break;

    // Memory management for seen set
    if (seenNames.size > MAX_SEEN) {
      const toDelete = Array.from(seenNames).slice(0, seenNames.size - MAX_SEEN);
      toDelete.forEach(name => seenNames.delete(name));
    }

    try {
      // 2. Wait for UI
      notify(DownloadState.WaitCardReady);
      await waitUntilCardReady(page, waitForReadySelectors);
      
      // 3. Click Download
      notify(DownloadState.StartDownload);
      const startedAt = Date.now();
      const beforeStartNames = new Set(seenNames);

      await clickDownload(page, downloadButtonSelector);

      // 4. Wait for file to appear (.crdownload / .tmp)
      notify(DownloadState.WaitDownloadStart);
      const startedFile = await waitForDownloadStart(downloadDir, beforeStartNames, DOWNLOAD_START_TIMEOUT_MS);
      seenNames.add(path.basename(startedFile));

      // 5. Wait for file to finalize (.mp4)
      notify(DownloadState.WaitFileSaved);
      const savedPath = await waitUntilFileSaved(downloadDir, startedAt, FILE_SAVE_TIMEOUT_MS);
      seenNames.add(path.basename(savedPath));
      savedFiles.push(savedPath);

      // 6. Post-Download Delay (Requested 2 seconds)
      notify(DownloadState.PostDownloadDelay);
      logStep(`Download complete. Waiting ${POST_DOWNLOAD_WAIT_MS}ms before swipe...`);
      await delay(POST_DOWNLOAD_WAIT_MS);

      if (savedFiles.length >= videosToDownload) {
        notify(DownloadState.Done);
        break;
      }

      // 7. Safe Swipe
      notify(DownloadState.SwipeNext);
      await performSafeSwipe(page);
      
    } catch (error) {
      logError('Download loop iteration failed', error);
      // Attempt recovery swipe
      try {
        notify(DownloadState.SwipeNext);
        await performSafeSwipe(page);
      } catch (swipeError) {
        logError('Failed to swipe after download error', swipeError);
        break;
      }
    }
  }

  if (savedFiles.length >= videosToDownload) {
    state = DownloadState.Done;
  }

  return { completed: savedFiles.length, savedFiles, lastState: state };
}
