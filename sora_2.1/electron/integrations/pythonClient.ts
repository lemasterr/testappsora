
import axios from 'axios';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logInfo, logError } from '../logging/logger';
import { getConfig } from '../config/config';

const PYTHON_PORT = 8000;
const BASE_URL = `http://127.0.0.1:${PYTHON_PORT}`;

let pythonProcess: ChildProcess | null = null;

function killProcessOnPort(port: number) {
  try {
    if ((process as any).platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = output.split('\n').filter(line => line.trim().length > 0);
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && parseInt(pid) > 0) {
          try { execSync(`taskkill /PID ${pid} /F`); } catch { }
        }
      });
    } else {
      try {
        const pid = execSync(`lsof -t -i:${port}`).toString().trim();
        if (pid) (process as any).kill(parseInt(pid), 'SIGKILL');
      } catch { }
    }
  } catch (e) { }
}

function getPythonPath(): string {
  const rootDir = (process as any).cwd();
  const isWin = (process as any).platform === 'win32';
  const venvPython = isWin
    ? path.join(rootDir, 'python-core', 'venv', 'Scripts', 'python.exe')
    : path.join(rootDir, 'python-core', 'venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) return venvPython;
  return isWin ? 'python' : 'python3';
}

export async function startPythonServer(): Promise<void> {
  if (pythonProcess) stopPythonServer();
  killProcessOnPort(PYTHON_PORT);

  const config = await getConfig();
  const ffmpegPath = config.ffmpegPath || '';
  const pythonExec = getPythonPath();
  const scriptPath = path.join((process as any).cwd(), 'python-core', 'main.py');

  logInfo('Python', `Spawning core server...`);

  return new Promise((resolve, reject) => {
    try {
      pythonProcess = spawn(pythonExec, [scriptPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHON_CORE_PORT: String(PYTHON_PORT), FFMPEG_BINARY: ffmpegPath, PYTHONUNBUFFERED: '1' }
      });
    } catch (err) {
      reject(new Error(`Failed to spawn Python: ${(err as Error).message}`));
      return;
    }

    pythonProcess.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) logInfo('PythonCore', msg);
    });

    pythonProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) logInfo('PythonCore', msg); // Most uvicorn logs are stderr
    });

    pythonProcess.on('error', (err) => {
      logError('Python', `Process error: ${err.message}`);
      pythonProcess = null;
      reject(err);
    });

    // Health check loop
    const healthCheck = async () => {
      for (let i = 0; i < 20; i++) {
        try {
          await axios.get(`${BASE_URL}/health`, { timeout: 500 });
          logInfo('Python', 'Core server is healthy');
          return resolve();
        } catch (e) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      stopPythonServer();
      reject(new Error('Python startup timed out'));
    };
    healthCheck();
  });
}

export function stopPythonServer() {
  if (pythonProcess) {
    if ((process as any).platform === 'win32') {
        try { if (pythonProcess.pid) execSync(`taskkill /pid ${pythonProcess.pid} /f /t`); } catch {}
    }
    pythonProcess.kill();
    pythonProcess = null;
  }
}

// --- Video API ---
export async function pythonBlur(inputDir: string, outputDir: string, config: any = {}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.post(`${BASE_URL}/video/blur`, { input_dir: inputDir, output_dir: outputDir, config });
    return res.data;
  } catch (e: any) { return { ok: false, error: e.message }; }
}

export async function pythonCleanMetadata(inputDir: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.post(`${BASE_URL}/video/clean-metadata`, { input_dir: inputDir });
    return res.data;
  } catch (e: any) { return { ok: false, error: e.message }; }
}

// --- Analytics API ---
export async function pythonRecordEvent(eventType: string, sessionId: string, payload: any = {}): Promise<void> {
  try {
    // Fire and forget
    axios.post(`${BASE_URL}/analytics/record`, { event_type: eventType, session_id: sessionId, payload }).catch(() => {});
  } catch {}
}

export async function pythonGetStats(days: number = 7): Promise<any> {
  try {
    const res = await axios.get(`${BASE_URL}/analytics/stats?days=${days}`);
    return res.data.stats;
  } catch { return {}; }
}

export async function pythonGetTopSessions(limit: number = 5): Promise<any[]> {
  try {
    const res = await axios.get(`${BASE_URL}/analytics/top-sessions?limit=${limit}`);
    return res.data.sessions || [];
  } catch { return []; }
}

// --- Notify API ---
export async function pythonSendTelegram(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.post(`${BASE_URL}/notify/send`, { token, chat_id: chatId, text });
    return res.data;
  } catch (e: any) { return { ok: false, error: e.message }; }
}

// --- Files API ---
export async function pythonCleanup(rootDir: string, maxAgeDays: number, dryRun: boolean = false): Promise<any> {
  try {
    const res = await axios.post(`${BASE_URL}/files/cleanup`, { root_dir: rootDir, max_age_days: maxAgeDays, dry_run: dryRun });
    return res.data;
  } catch (e: any) { return { ok: false, error: e.message }; }
}
