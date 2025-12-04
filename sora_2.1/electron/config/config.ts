
// sora_2/electron/config/config.ts
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { ensureDir } from '../utils/fs';
import { encryptSensitive, decryptSensitive } from './secureStorage';

// Define types locally to avoid circular dependency with shared/types.ts
export interface WatermarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface WatermarkMask {
  id: string;
  name: string;
  rects: WatermarkRect[];
  updatedAt?: number;
}

export type SoraTimings = {
  pollIntervalMs?: number;
  retryIntervalMs?: number;
  backoffOnRejectSec?: number;
  successPauseEveryN?: number;
  successPauseSec?: number;
  finalPauseSec?: number;
  humanTypingDelayMs?: number;
};

// Universal Automation Config Types
export type SelectorType = 'button' | 'input' | 'text' | 'image' | 'container' | 'link' | 'unknown';

export interface UniversalSelector {
  id: string;
  integrationId: string;
  label: string;
  type: SelectorType;
  cssSelector: string;
  xpath?: string;
  fallbackSelector?: string;
  status: 'pending' | 'valid' | 'error';
  lastTestedAt?: number;
}

export interface Integration {
  id: string;
  name: string;
  urlPattern: string;
  description?: string;
}

export type Config = {
  sessionsRoot: string;
  chromeExecutablePath: string | null;
  chromeUserDataRoot?: string | null;
  chromeUserDataDir: string | null;
  chromeActiveProfileName: string | null;
  chromeProfileId?: string | null;
  chromeClonedProfilesRoot?: string | null;
  cdpPort: number | null;
  promptDelayMs: number;
  draftTimeoutMs: number;
  downloadTimeoutMs: number;
  maxParallelSessions: number;
  ffmpegPath: string | null;
  
  // Sora 1.0 Timings
  soraTimings?: SoraTimings;
  globalDownloadLimit?: number;
  mergeBatchSize?: number;

  // Universal Automation
  integrations?: Integration[];
  universalSelectors?: UniversalSelector[];

  cleanup?: {
    enabled?: boolean;
    dryRun?: boolean;
    retentionDaysDownloads?: number;
    retentionDaysBlurred?: number;
    retentionDaysTemp?: number;
  };
  automator?: {
    dryRun?: boolean;
    downloadLimit?: number;
  };
  telegram: {
    enabled: boolean;
    botToken: string | null;
    chatId: string | null;
  };
  telegramTemplates?: {
    pipelineFinished?: string;
    sessionError?: string;
  };
  hooks?: {
    postDownload?: string;
  };
  watermarkMasks?: WatermarkMask[];
  activeWatermarkMaskId?: string;
  watermarkDefaults?: {
    watermark_mode?: 'blur' | 'delogo' | 'hybrid' | null;
    x?: number; y?: number; w?: number; h?: number;
    blur_strength?: number; band?: number;
  };
  downloadLimit?: number | null; // legacy alias
};

const CONFIG_FILE = 'config.json';

// Cache configuration
let configCache: { data: Config; timestamp: number } | null = null;
const CACHE_TTL = 5000; // 5 seconds

function defaultConfig(): Config {
  const defaultSessionsRoot = path.join(getUserDataPath(), 'sessions');
  return {
    sessionsRoot: defaultSessionsRoot,
    chromeExecutablePath: null,
    chromeUserDataRoot: null,
    chromeUserDataDir: null,
    chromeActiveProfileName: null,
    chromeProfileId: null,
    chromeClonedProfilesRoot: path.join(defaultSessionsRoot, 'chrome-clones'),
    cdpPort: 9222,
    promptDelayMs: 2000,
    draftTimeoutMs: 60_000,
    downloadTimeoutMs: 300_000,
    maxParallelSessions: 2,
    ffmpegPath: null,
    mergeBatchSize: 0,
    
    soraTimings: {
        pollIntervalMs: 1200,
        retryIntervalMs: 2500,
        backoffOnRejectSec: 180,
        successPauseEveryN: 2,
        successPauseSec: 180,
        finalPauseSec: 20,
        humanTypingDelayMs: 12
    },
    globalDownloadLimit: 0,

    integrations: [],
    universalSelectors: [],

    automator: {
      dryRun: false,
      downloadLimit: null as any,
    },
    cleanup: {
      enabled: true,
      dryRun: false,
      retentionDaysDownloads: 14,
      retentionDaysBlurred: 30,
      retentionDaysTemp: 3,
    },
    telegram: {
      enabled: false,
      botToken: null,
      chatId: null,
    },
    telegramTemplates: {
      pipelineFinished: undefined,
      sessionError: undefined,
    },
    hooks: {
      postDownload: undefined,
    },
    watermarkMasks: [],
    activeWatermarkMaskId: undefined,
    watermarkDefaults: {
      watermark_mode: null,
      x: 0, y: 0, w: 0, h: 0,
      blur_strength: 20, band: 4,
    },
    downloadLimit: null,
  };
}

function getConfigPath(): string {
  return path.join(getUserDataPath(), CONFIG_FILE);
}

async function ensureAppReady(): Promise<void> {
  if (app.isReady()) return;
  await app.whenReady();
}

async function ensureConfigDir(): Promise<void> {
  await ensureAppReady();
  await ensureDir(getUserDataPath());
}

export function getUserDataPath(): string {
  return app.getPath('userData');
}

function mergeConfig(base: Config, partial?: Partial<Config>): Config {
  const next: Config = {
    ...base,
    ...partial,
    soraTimings: {
        ...base.soraTimings,
        ...(partial?.soraTimings ?? {})
    },
    telegram: {
      ...base.telegram,
      ...(partial?.telegram ?? {}),
    },
    cleanup: {
      ...base.cleanup,
      ...(partial?.cleanup ?? {}),
    },
    automator: {
      ...base.automator,
      ...(partial?.automator ?? {}),
    },
    integrations: partial?.integrations ?? base.integrations ?? [],
    universalSelectors: partial?.universalSelectors ?? base.universalSelectors ?? [],
    telegramTemplates: {
      ...base.telegramTemplates,
      ...(partial?.telegramTemplates ?? {}),
    },
    hooks: {
      ...base.hooks,
      ...(partial?.hooks ?? {}),
    },
    watermarkMasks: partial?.watermarkMasks ?? base.watermarkMasks,
    activeWatermarkMaskId: partial?.activeWatermarkMaskId ?? base.activeWatermarkMaskId,
    watermarkDefaults: {
      ...(base as any).watermarkDefaults,
      ...((partial as any)?.watermarkDefaults ?? {}),
    },
    downloadLimit: (partial as any)?.downloadLimit ?? (base as any).downloadLimit,
    globalDownloadLimit: partial?.globalDownloadLimit ?? base.globalDownloadLimit
  };
  return next;
}

async function loadConfigFromDisk(): Promise<Config> {
  await ensureConfigDir();
  const defaults = defaultConfig();

  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;

    if (parsed.telegram?.botToken) {
      parsed.telegram.botToken = decryptSensitive(parsed.telegram.botToken);
    }

    const merged = mergeConfig(defaults, parsed);
    await ensureDir(merged.sessionsRoot);
    return merged;
  } catch (error) {
    if ((error as Error & { code?: string })?.code !== 'ENOENT') {
      throw error;
    }

    await fs.writeFile(getConfigPath(), JSON.stringify(defaults, null, 2), 'utf-8');
    await ensureDir(defaults.sessionsRoot);
    return defaults;
  }
}

export async function getConfig(): Promise<Config> {
  const now = Date.now();
  if (configCache && (now - configCache.timestamp) < CACHE_TTL) {
    return configCache.data;
  }

  const config = await loadConfigFromDisk();
  configCache = { data: config, timestamp: now };
  return config;
}

export async function updateConfig(partial: Partial<Config>): Promise<Config> {
  const current = await getConfig();

  const toSave: Partial<Config> = { ...partial };
  if (toSave.telegram?.botToken) {
    toSave.telegram.botToken = encryptSensitive(toSave.telegram.botToken);
  }

  const next = mergeConfig(current, partial);

  const diskVersion = JSON.parse(JSON.stringify(next));
  if (diskVersion.telegram?.botToken) {
    diskVersion.telegram.botToken = encryptSensitive(diskVersion.telegram.botToken);
  }

  await ensureConfigDir();
  await ensureDir(next.sessionsRoot);

  try {
    const existing = await fs.readFile(getConfigPath(), 'utf-8');
    await fs.writeFile(getConfigPath() + '.bak', existing, 'utf-8');
  } catch (e) {
    // ignore
  }

  await fs.writeFile(getConfigPath(), JSON.stringify(diskVersion, null, 2), 'utf-8');
  configCache = { data: next, timestamp: Date.now() };

  return next;
}
