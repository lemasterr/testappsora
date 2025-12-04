
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import http from 'http';
import { logError, logInfo } from '../logging/logger';
import { resolveChromeExecutablePath } from '../../platform/chromePaths';

export interface ChromeLaunchOptions {
  port: number;
  profileDir: string;
  startUrl?: string;
  headless?: boolean;
  extraArgs?: string[];
}

export interface ChromeLaunchResult {
  child: ChildProcess;
  port: number;
  profileDir: string;
  wsEndpoint: string;
}

/**
 * Checks if a port is open and responding to CDP JSON version request.
 * Includes a strict timeout to prevent hanging requests on zombies.
 */
async function checkCdpPort(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/json/version',
      method: 'GET',
      timeout: 500 // 500ms hard timeout per check
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            resolve(json.webSocketDebuggerUrl || null);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(); // Explicitly destroy socket
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });

    req.end();
  });
}

export async function launchChromeWithCdp(options: ChromeLaunchOptions): Promise<ChromeLaunchResult> {
  // 1. Resolve Chrome Path (Native/System)
  let chromePath = await resolveChromeExecutablePath();
  
  logInfo('ChromeLauncher', `Preparing launch: Port ${options.port}, Profile: ${options.profileDir}`);
  
  fs.mkdirSync(options.profileDir, { recursive: true });

  // Check for zombie processes on this port before launching
  const existingWs = await checkCdpPort(options.port);
  if (existingWs) {
    logInfo('ChromeLauncher', `Chrome already running on port ${options.port}, reusing...`);
    // Returning specific error code to let manager know it's alive and responding
    throw new Error(`ALREADY_RUNNING:${existingWs}`);
  }

  // 2. Build Arguments (Strict Sora 1.0 Spec)
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    // Critical flags to disable automation indicators and isolation
    '--disable-features=IsolateOrigins,site-per-process,Translate,GlobalMediaControls,MediaSessionService,AutomationControlled',
    '--disable-blink-features=AutomationControlled',
    // NOTE: Removed --password-store=basic to allow system cookie decryption (DPAPI/Keychain)
    '--window-size=960,540', // 1/4 of 1080p screen
    '--force-device-scale-factor=1',
    ...(options.startUrl ? [options.startUrl] : ['about:blank'])
  ];

  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }

  logInfo('ChromeLauncher', `Spawning process...`);

  // 3. Native Spawn
  const child = spawn(chromePath, args, {
    stdio: 'ignore',
    detached: false 
  });
  
  // Prevent parent from waiting for child, but keep reference
  child.unref(); 

  // Monitor for immediate exit (crash on start)
  let hasExited = false;
  child.on('exit', (code) => {
    hasExited = true;
    if (code !== 0 && code !== null) {
      logError('ChromeLauncher', `Chrome process exited unexpectedly with code ${code}`);
    }
  });

  // 4. Polling for CDP
  const start = Date.now();
  const timeout = 30000; // 30s timeout to be safe

  while (Date.now() - start < timeout) {
    if (hasExited) {
      throw new Error('Chrome process crashed immediately after launch. Check paths and permissions.');
    }

    const wsUrl = await checkCdpPort(options.port);
    if (wsUrl) {
      logInfo('ChromeLauncher', `CDP Endpoint found: ${wsUrl}`);
      return {
        child,
        port: options.port,
        profileDir: options.profileDir,
        wsEndpoint: wsUrl
      };
    }
    
    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Chrome timed out launching on port ${options.port} after 30s`);
}
