
import path from 'path';
import fs from 'fs/promises';
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { getConfig, updateConfig } from './config/config';
import {
  listChromeProfiles,
  scanChromeProfiles,
  setActiveChromeProfile,
  cloneActiveChromeProfile,
  resolveChromeProfileForSession,
} from './chrome/profiles';
import { getSession, listSessions, saveSession, deleteSession, getSessionPaths } from './sessions/repo';
import { runPromptsAdapter } from './automation/sessionAutomation';
import { runDownloads, cancelDownloads } from './automation/downloader';
import { runPipeline, cancelPipeline } from './automation/pipeline';
import { stopTask, cancelAllTasks } from './automation/taskRegistry'; // Unified stop
import { blurVideoWithProfile, listBlurProfiles, saveBlurProfile, deleteBlurProfile, blurVideo, type BlurZone } from './video/ffmpegBlur';
import { mergeVideosInDir } from './video/ffmpegMerge';
import { testTelegram, sendTelegramMessage } from './integrations/telegram';
import { loggerEvents, logError, logInfo, getRecentLogs } from './logging/logger';
import { clearLogFile, ensureLogDestination } from '../core/utils/log';
import { pages } from '../core/config/pages';
import { runCleanupNow, scheduleDailyCleanup } from './maintenance/cleanup';
import { openProfileFolder, readProfileFiles, saveProfileFiles } from './content/profileFiles';
import { sessionLogBroker } from './sessionLogs';
import { launchBrowserForSession } from './chrome/cdp';
import { shutdownAllChrome } from './chrome/manager';
import { resolveSessionCdpPort } from './utils/ports';
import { startPythonServer, stopPythonServer } from './integrations/pythonClient';
import { runHealthCheck } from './healthCheck';
import { startInspectorForSession, getLastSelectorForSession, registerSessionPage } from './automation/selectorInspector';
import './chrome/processManager';
import type { Session } from './sessions/types';

declare const __dirname: string;

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV !== 'production';

function createMainWindow(): void {
  const preload = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 1024,
    frame: false,
    backgroundColor: '#030305',
    webPreferences: { preload, nodeIntegration: false, contextIsolation: true },
  });
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));

  // Forward logs to renderer
  loggerEvents.on('log', (entry) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('logging:push', entry);
  });
}

async function findSessionByKey(key: string): Promise<Session | null> {
  const all = await listSessions();
  return (all.find(s => s.name === key) as Session) || null;
}

logInfo('main', `starting, NODE_ENV=${process.env.NODE_ENV}`);

app.whenReady().then(async () => {
  try { await startPythonServer(); } catch (e) { logError('main', `Python error: ${(e as Error).message}`); }
  createMainWindow();
  scheduleDailyCleanup();
});

app.on('window-all-closed', () => { if ((process as any).platform !== 'darwin') app.quit(); });
app.on('before-quit', async () => {
  stopPythonServer();
  await shutdownAllChrome();
});

function reg(channel: string, handler: (...args: any[]) => any) {
  ipcMain.handle(channel, async (_, ...args) => {
    try { return await handler(...args); }
    catch (e) {
      logError('ipc', `${channel}: ${(e as Error).message}`);
      return { ok: false, error: (e as Error).message };
    }
  });
}

// --- CONFIG & CHROME ---
reg('config:get', getConfig);
reg('config:update', updateConfig);
reg('chrome:scanProfiles', async () => ({ ok: true, profiles: await scanChromeProfiles() }));
reg('chrome:listProfiles', async () => ({ ok: true, profiles: await listChromeProfiles() }));
reg('chrome:setActiveProfile', async (n) => { await setActiveChromeProfile(n); return { ok: true, profiles: await listChromeProfiles() }; });
reg('chrome:cloneProfile', cloneActiveChromeProfile);

// --- FILES ---
reg('files:read', async (profileName) => ({ ok: true, files: await readProfileFiles(profileName) }));
reg('files:save', async (profileName, files) => saveProfileFiles(profileName, files));
reg('files:openFolder', async (profileName) => openProfileFolder(profileName));
reg('files:choose', async (type) => {
    const res = await dialog.showOpenDialog({ properties: [type === 'folder' ? 'openDirectory' : 'openFile'] });
    return res.filePaths[0];
});
reg('files:consolidate', async (targetFolder?: string) => {
    if (!targetFolder) {
        const sel = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
        if (sel.canceled) return { ok: false, error: 'Cancelled' };
        targetFolder = sel.filePaths[0];
    }
    const sessions = await listSessions();
    let count = 0;
    for (const sess of sessions) {
        const paths = await getSessionPaths(sess);
        const dirsToCheck = [paths.cleanDir, paths.downloadDir];
        for (const dir of dirsToCheck) {
            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (file.endsWith('.mp4')) {
                        await fs.copyFile(path.join(dir, file), path.join(targetFolder, `${sess.name}_${file}`));
                        count++;
                    }
                }
            } catch {}
        }
    }
    return { ok: true, count, path: targetFolder };
});

// --- SESSIONS ---
ipcMain.handle('sessions:subscribeLogs', (e, id) => { sessionLogBroker.subscribe(id, e.sender); return { ok: true }; });
ipcMain.handle('sessions:unsubscribeLogs', (e, id) => { sessionLogBroker.unsubscribe(id, e.sender.id); return { ok: true }; });
reg('sessions:list', listSessions);
reg('sessions:get', getSession);
reg('sessions:save', saveSession);
reg('sessions:delete', deleteSession);

// --- UNIFIED AUTOMATION COMMANDS ---
reg('sessions:command', async (id, action) => {
  const s = await getSession(id);
  if (!s) throw new Error('Session not found');
  
  if (action === 'startChrome') {
      const profile = await resolveChromeProfileForSession({ chromeProfileName: s.chromeProfileName, sessionId: s.id });
      if (!profile) throw new Error('No profile');
      const config = await getConfig();
      const port = resolveSessionCdpPort(s, config.cdpPort ?? 9222);
      const browser = await launchBrowserForSession(profile, port, s.id); 
      // Register for Inspector
      const pages = await browser.pages();
      if(pages.length > 0) registerSessionPage(s.id, pages[0]);
      return { ok: true, details: `Launched on port ${port}` };
  }
  
  if (action === 'runPrompts') return runPromptsAdapter(s as Session, s.maxVideos || 0);
  if (action === 'runDownloads') return runDownloads(s as Session, s.maxVideos || 0);
  
  if (action === 'stop') { 
      // Unified Stop: Calls the task registry to abort any running task for this session
      stopTask(s.id);
      return { ok: true, details: 'Stop signal sent' }; 
  }
  return { ok: false, error: 'Unknown action' };
});

// Redundant aliases mapped to same logic for compatibility
reg('autogen:run', async (id) => { const s = await getSession(id); return s ? runPromptsAdapter(s as any, s.maxVideos || 0) : { ok: false }; });
reg('autogen:stop', async (id) => { stopTask(id); return { ok: true }; });
reg('downloader:run', async (id, opt) => { const s = await getSession(id); return s ? runDownloads(s as any, opt?.limit || 0) : { ok: false }; });
reg('downloader:stop', async (id) => { stopTask(id); return { ok: true }; });

// --- PIPELINE ---
reg('pipeline:run', async (steps) => { await runPipeline(steps, (s) => mainWindow?.webContents.send('pipeline:progress', s)); return { ok: true }; });
reg('pipeline:cancel', cancelPipeline);
reg('pipeline:skip', async () => {
    // Stops currently running session tasks (prompts/downloads)
    // The pipeline runner (workflow.ts) will see them as finished and proceed to the next step
    cancelAllTasks();
    return { ok: true };
});

// --- SELECTOR INSPECTOR ---
reg('inspector:start', async (sessionId) => {
    return startInspectorForSession(sessionId);
});
reg('inspector:poll', async (sessionId) => {
    return getLastSelectorForSession(sessionId);
});

// --- VIDEO TOOLS ---
function zonesToRects(zones: any[] = []) {
  return zones.map((z) => ({ x: z.x, y: z.y, width: z.w ?? z.width, height: z.h ?? z.height, label: z.label, mode: z.mode, blur_strength: z.blur_strength, band: z.band }));
}
// Robust mapper to ensure numeric values for backend
function rectsToZones(rects: any[] = []): BlurZone[] {
  return rects.map((r) => ({ 
      x: Number(r.x) || 0, 
      y: Number(r.y) || 0, 
      w: Number(r.w ?? r.width) || 0, 
      h: Number(r.h ?? r.height) || 0, 
      mode: r.mode, 
      blur_strength: r.blur_strength, 
      band: r.band 
  } as any));
}
reg('video:blurProfiles:list', async () => {
  const profiles = await listBlurProfiles();
  return profiles.map((p: any) => ({ id: p.id, name: p.name, rects: zonesToRects(p.zones) }));
});
reg('video:blurProfiles:save', async (mask: any) => {
  await saveBlurProfile({ id: mask.id, name: mask.name, zones: rectsToZones(mask.rects || []) });
  const profiles = await listBlurProfiles();
  return profiles.map((p: any) => ({ id: p.id, name: p.name, rects: zonesToRects(p.zones) }));
});
reg('video:blurProfiles:delete', async (id: string) => {
  await deleteBlurProfile(id);
  const profiles = await listBlurProfiles();
  return profiles.map((p: any) => ({ id: p.id, name: p.name, rects: zonesToRects(p.zones) }));
});
reg('video:runBlur', async (input: string, rects: any[]) => {
    const parsed = path.parse(input);
    const output = path.join(parsed.dir, `${parsed.name}_blurred${parsed.ext}`);
    await blurVideo(input, output, rectsToZones(rects));
    return { ok: true, output };
});
reg('video:merge', async (inputDir: string, output: string) => {
    await mergeVideosInDir(inputDir, output);
    return { ok: true };
});

// --- DOWNLOADER PAGE EXTRAS ---
reg('downloader:openDrafts', async (name) => {
    const s = await findSessionByKey(name);
    if (!s) return { ok: false, error: 'Session not found' };
    const config = await getConfig();
    const profile = await resolveChromeProfileForSession({ chromeProfileName: s.chromeProfileName, sessionId: s.id });
    if (!profile) return { ok: false, error: 'Profile not found' };
    const port = resolveSessionCdpPort(s, config.cdpPort ?? 9222);
    const browser = await launchBrowserForSession(profile, port, s.id); 
    const page = await browser.newPage();
    registerSessionPage(s.id, page); // Important for inspector
    await page.goto(pages.draftsUrl);
    return { ok: true };
});
reg('downloader:scanDrafts', async (name) => { return { ok: true, draftsFound: 0 }; });
reg('downloader:downloadAll', async (name, opt) => { const s = await findSessionByKey(name); return s ? runDownloads(s as any, opt?.limit || 0) : { ok: false }; });

// --- SYSTEM ---
reg('system:openPath', (t) => shell.openPath(t));
reg('system:openLogs', async () => { const {dir} = ensureLogDestination(); if(dir) shell.openPath(dir); return {ok:true}; });
reg('system:openGlobalMerge', async () => {
    const config = await getConfig();
    const mergeDir = path.join(config.sessionsRoot, '_GLOBAL_MERGE_');
    await fs.mkdir(mergeDir, { recursive: true });
    await shell.openPath(mergeDir);
    return { ok: true };
});
reg('system:openBlurred', async () => {
    const config = await getConfig();
    // Since blurred is per-session, open the root sessions folder so user can navigate
    await shell.openPath(config.sessionsRoot);
    return { ok: true };
});

reg('logging:clear', clearLogFile);
reg('logging:getHistory', async () => ({ ok: true, entries: getRecentLogs() }));

reg('health:check', runHealthCheck);
reg('window:minimize', () => mainWindow?.minimize());
reg('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
reg('window:isMaximized', () => mainWindow?.isMaximized());
reg('window:close', () => mainWindow?.close());
reg('gallery:scan', async () => {
    const sessions = await listSessions();
    const videos = [];
    for (const sess of sessions) {
        const paths = await getSessionPaths(sess);
        const dirs = [{ path: paths.downloadDir, type: 'raw' }, { path: paths.cleanDir, type: 'clean' }];
        for (const d of dirs) {
            try {
                const entries = await fs.readdir(d.path);
                for (const file of entries) {
                    if (file.toLowerCase().endsWith('.mp4')) {
                        const fullPath = path.join(d.path, file);
                        const stats = await fs.stat(fullPath);
                        videos.push({ path: fullPath, name: file, size: stats.size, mtime: stats.mtimeMs, sessionId: sess.id, sessionName: sess.name, type: d.type });
                    }
                }
            } catch {}
        }
    }
    return videos.sort((a, b) => b.mtime - a.mtime);
});
reg('gallery:delete', async (filePath: string) => {
    try {
        await fs.unlink(filePath);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
});

reg('cleanup:run', runCleanupNow);
reg('telegram:test', testTelegram);
reg('telegram:sendMessage', sendTelegramMessage);
reg('analytics:getDailyStats', async (d) => []); // Placeholder
reg('analytics:getTopSessions', async (l) => []); // Placeholder

export {};
