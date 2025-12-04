
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import { resolveChromeExecutablePath } from '../../platform/chromePaths';
import { logError, logInfo } from '../logging/logger';

export type SessionId = string;

export interface ChromeSessionConfig {
  sessionId: SessionId;
  profileDir: string;
  port: number;
  startUrl?: string;
  headless?: boolean;
  extraArgs?: string[];
}

export interface ChromeInstance {
  sessionId: SessionId;
  port: number;
  profileDir: string;
  wsEndpoint: string;
  child: ChildProcess;
  startedAt: number;
}

export interface ChromePoolOptions {
  maxConcurrent: number;
  chromePath?: string;
  headless?: boolean;
}

export class ChromePool {
  private readonly maxConcurrent: number;
  private readonly chromePath?: string;
  private readonly headless: boolean;

  // Активные экземпляры Chrome: sessionId -> ChromeInstance
  private active: Map<SessionId, ChromeInstance> = new Map();

  // Сессии, которые ждут запуска
  private queue: ChromeSessionConfig[] = [];

  private healthCheckIntervalMs = 5000;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: ChromePoolOptions) {
    this.maxConcurrent = opts.maxConcurrent;
    this.chromePath = opts.chromePath;
    this.headless = opts.headless ?? false;
  }

  // Публичный метод: гарантирует, что для sessionId есть ЗАПУЩЕННЫЙ Chrome
  async ensureChrome(config: ChromeSessionConfig): Promise<ChromeInstance> {
    const existing = this.active.get(config.sessionId);
    if (existing) {
      return existing;
    }

    // Если есть свободный слот — запускаем сразу
    if (this.active.size < this.maxConcurrent) {
      const inst = await this.launchNewChrome(config);
      this.active.set(config.sessionId, inst);
      this.ensureHealthLoop();
      return inst;
    }

    // Иначе — ставим в очередь и ждём
    return new Promise<ChromeInstance>((resolve, reject) => {
      logInfo('ChromePool', `Session ${config.sessionId} queued (active: ${this.active.size}/${this.maxConcurrent})`);
      this.queue.push(config);

      // Примитивный поллинг: ждём пока для этой сессии не появится ChromeInstance
      const start = Date.now();
      const timeoutMs = 120000; // 2 минуты на ожидание слота

      const tick = () => {
        const inst = this.active.get(config.sessionId);
        if (inst) {
          resolve(inst);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          // Clean up queue if timed out
          const idx = this.queue.indexOf(config);
          if (idx !== -1) this.queue.splice(idx, 1);
          
          reject(new Error(`Timeout waiting for Chrome slot for session ${config.sessionId}`));
          return;
        }
        setTimeout(tick, 500);
      };

      tick();
    });
  }

  // Фактический запуск Chrome для одной сессии
  private async launchNewChrome(config: ChromeSessionConfig): Promise<ChromeInstance> {
    let chromeExecutable = this.chromePath;
    if (!chromeExecutable) {
      chromeExecutable = await resolveChromeExecutablePath();
    }

    const args = buildChromeArgs({
      port: config.port,
      profileDir: config.profileDir,
      startUrl: config.startUrl ?? 'about:blank',
      headless: this.headless,
      extraArgs: config.extraArgs ?? [],
    });

    logInfo('ChromePool', `Launching Chrome for ${config.sessionId} on port ${config.port}`);
    const child = spawnChrome(chromeExecutable, args, config.profileDir);

    try {
      const { wsEndpoint } = await waitForCdpEndpoint(config.port);
      return {
        sessionId: config.sessionId,
        port: config.port,
        profileDir: config.profileDir,
        wsEndpoint,
        child,
        startedAt: Date.now(),
      };
    } catch (e) {
      // Kill process if CDP failed
      try { child.kill(); } catch {}
      throw e;
    }
  }

  // Закрыть Chrome для конкретной сессии
  async stopChrome(sessionId: SessionId): Promise<void> {
    const inst = this.active.get(sessionId);
    if (!inst) return;

    logInfo('ChromePool', `Stopping Chrome for session ${sessionId}`);
    try {
      if ((process as any).platform === 'win32') {
        spawn('taskkill', ['/pid', String(inst.child.pid), '/f', '/t']);
      } else {
        inst.child.kill();
      }
    } catch {
      // ignore
    }
    this.active.delete(sessionId);

    // после освобождения слота — пробуем запустить следующих из очереди
    this.tryLaunchFromQueue();
  }

  shutdown() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    for (const sessionId of this.active.keys()) {
      this.stopChrome(sessionId);
    }
  }

  // Пытаемся достать из очереди следующую сессию и запустить Chrome
  private async tryLaunchFromQueue() {
    if (this.active.size >= this.maxConcurrent) return;
    const next = this.queue.shift();
    if (!next) return;

    try {
      const inst = await this.launchNewChrome(next);
      this.active.set(next.sessionId, inst);
      this.ensureHealthLoop();
    } catch (err) {
      logError('ChromePool', `Error launching queued session ${next.sessionId}: ${(err as Error).message}`);
      // Try next one
      this.tryLaunchFromQueue();
    }

    // Если после старта всё ещё есть свободные слоты — рекурсивно
    if (this.active.size < this.maxConcurrent && this.queue.length > 0) {
      this.tryLaunchFromQueue();
    }
  }

  // Периодический health-check
  private ensureHealthLoop() {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(async () => {
      if (this.active.size === 0 && this.queue.length === 0) {
        if (this.healthTimer) {
          clearInterval(this.healthTimer);
          this.healthTimer = null;
        }
        return;
      }

      for (const [sessionId, inst] of this.active.entries()) {
        const ok = await isCdpAlive(inst.port);
        if (!ok) {
          logError('ChromePool', `Chrome died for session ${sessionId}`);
          this.active.delete(sessionId);
          try { inst.child.kill(); } catch {}
        }
      }

      if (this.active.size < this.maxConcurrent && this.queue.length > 0) {
        this.tryLaunchFromQueue();
      }
    }, this.healthCheckIntervalMs);
  }
}

// ==== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====

function buildChromeArgs(input: {
  port: number;
  profileDir: string;
  startUrl: string;
  headless: boolean;
  extraArgs: string[];
}): string[] {
  const args = [
    `--remote-debugging-port=${input.port}`,
    `--user-data-dir=${input.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-popup-blocking',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI,AutomationControlled',
    '--autoplay-policy=no-user-gesture-required',
    '--start-maximized',
  ];

  if (input.headless) {
    args.push('--headless=new');
    args.push('--disable-gpu');
  }

  if (input.extraArgs && input.extraArgs.length > 0) {
    args.push(...input.extraArgs);
  }

  args.push(input.startUrl);

  return args;
}

function spawnChrome(exe: string, args: string[], profileDir: string): ChildProcess {
  fs.mkdirSync(profileDir, { recursive: true });
  const child = spawn(exe, args, { stdio: 'ignore', detached: false });
  child.unref();
  return child;
}

async function waitForCdpEndpoint(port: number): Promise<{ wsEndpoint: string }> {
  const url = `http://127.0.0.1:${port}/json/version`;
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      const res = await fetchJson(url);
      if (res && res.webSocketDebuggerUrl) {
        return { wsEndpoint: res.webSocketDebuggerUrl };
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`CDP not ready on port ${port} after 20s`);
}

async function isCdpAlive(port: number): Promise<boolean> {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}