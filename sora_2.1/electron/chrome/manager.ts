
import puppeteer, { type Browser } from 'puppeteer-core';
import { ChromeProfile, resolveProfileLaunchTarget, verifyProfileClone, ensureCloneSeededFromProfile } from './profiles';
import { launchChromeWithCdp } from './chromeLauncher';
import { logInfo, logError } from '../logging/logger';

// Registry of active sessions to prevent double-launching
// Map<SessionID, { port: number, wsEndpoint: string }>
const activeSessions = new Map<string, { port: number, wsEndpoint: string }>();

export async function getOrLaunchChromeForProfile(
  profile: ChromeProfile, 
  port: number, 
  sessionId: string
): Promise<Browser> {
  if (!sessionId) {
    throw new Error('sessionId is required for Chrome management');
  }

  logInfo('ChromeManager', `Requesting Chrome for session ${sessionId} on port ${port}`);

  // 1. Check if we have a record of this session in memory
  const active = activeSessions.get(sessionId);
  if (active) {
    try {
      // Try connecting to verify it's actually alive
      const browser = await puppeteer.connect({
        browserWSEndpoint: active.wsEndpoint,
        defaultViewport: null
      });
      logInfo('ChromeManager', `Reconnected to existing session ${sessionId}`);
      return browser;
    } catch (e) {
      logInfo('ChromeManager', `Existing connection stale for ${sessionId}, relaunching...`);
      activeSessions.delete(sessionId);
    }
  }

  // 2. Resolve Paths & Seed Profile (Flatten to Default)
  const { userDataDir } = await resolveProfileLaunchTarget(profile, sessionId);

  const verification = await verifyProfileClone(userDataDir, 'Default');
  if (!verification.ok) {
    logInfo('ChromeManager', `Seeding profile at ${userDataDir} (reason: ${verification.reason})`);
    await ensureCloneSeededFromProfile(profile, userDataDir);
  }

  // 3. Launch using the native launcher
  try {
    const launched = await launchChromeWithCdp({
      port,
      profileDir: userDataDir,
      startUrl: 'https://sora.chatgpt.com',
      extraArgs: [] 
    });

    activeSessions.set(sessionId, { port, wsEndpoint: launched.wsEndpoint });

    logInfo('ChromeManager', `Connecting Puppeteer to ${launched.wsEndpoint}`);
    const browser = await puppeteer.connect({
      browserWSEndpoint: launched.wsEndpoint,
      defaultViewport: null
    });

    return browser;

  } catch (err: any) {
    // Special handling if launcher says "ALREADY_RUNNING"
    // This means the user (or previous run) left the window open. We attach to it.
    if (err.message && err.message.startsWith('ALREADY_RUNNING:')) {
      const wsUrl = err.message.split('ALREADY_RUNNING:')[1];
      logInfo('ChromeManager', `Attaching to already running Chrome on port ${port}`);
      
      activeSessions.set(sessionId, { port, wsEndpoint: wsUrl });
      
      return puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null
      });
    }
    
    logError('ChromeManager', `Launch failed: ${err.message}`);
    throw err;
  }
}

export async function shutdownAllChrome(): Promise<void> {
  // In this persistent model, we keep windows open unless manually closed by user
  activeSessions.clear();
}
