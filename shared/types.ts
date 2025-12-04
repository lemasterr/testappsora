
import type { Config as BackendConfig } from '../electron/config/config';

export interface ChromeProfile {
  id: string;
  name: string;
  userDataDir: string;
  profileDirectory: string;
  profileDir?: string;
  isDefault?: boolean;
  lastUsed?: string;
  isActive?: boolean;
}

export interface ManagedSession {
  id: string;
  name: string;
  chromeProfileName: string | null;
  promptProfile: string | null;
  cdpPort: number | null;
  promptsFile: string;
  imagePromptsFile: string;
  titlesFile: string;
  submittedLog: string;
  failedLog: string;
  downloadDir: string;
  cleanDir: string;
  cursorFile: string;
  maxVideos: number;
  openDrafts: boolean;
  autoLaunchChrome: boolean;
  autoLaunchAutogen: boolean;
  notes: string;
  status?: 'idle' | 'running' | 'warning' | 'error';
  promptCount?: number;
  titleCount?: number;
  hasFiles?: boolean;
  downloadedCount?: number;

  // --- Settings (Sora 9 Style) ---
  enableAutoPrompts?: boolean;
  promptDelayMs?: number;
  postLastPromptDelayMs?: number;
  maxPromptsPerRun?: number;
  autoChainAfterPrompts?: boolean;
  
  // Merge Settings
  mergeBatchSize?: number; // 0 = all in one
}

export type SoraTimings = {
  pollIntervalMs?: number;        // 1200
  retryIntervalMs?: number;       // 2500
  backoffOnRejectSec?: number;    // 180
  successPauseEveryN?: number;    // 2
  successPauseSec?: number;       // 180
  finalPauseSec?: number;         // 20
  humanTypingDelayMs?: number;    // 12
};

// --- Universal Automation Types ---

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
  urlPattern: string; // e.g., "sora.chatgpt.com" or "midjourney.com"
  description?: string;
}

export type Config = BackendConfig & {
  chromeProfiles?: ChromeProfile[];
  sessions?: ManagedSession[];
  integrations?: Integration[];
  universalSelectors?: UniversalSelector[];
  watermarkMasks?: WatermarkMask[];
  activeWatermarkMaskId?: string;
  soraTimings?: SoraTimings;
  globalDownloadLimit?: number;
  mergeBatchSize?: number; // Added Global Merge Setting
};

export type SessionCommandAction =
  | 'startChrome'
  | 'runPrompts'
  | 'runDownloads'
  | 'cleanWatermark'
  | 'stop';

export interface SessionLogEntry {
  timestamp: number;
  scope: 'Chrome' | 'Prompts' | 'Download' | 'Worker' | 'Watermark' | string;
  level: 'info' | 'error' | 'warn';
  message: string;
}

export type LogSource = 'Chrome' | 'Autogen' | 'Downloader' | 'Pipeline' | string;

export interface AppLogEntry {
  timestamp: number;
  source: LogSource;
  level: 'info' | 'error' | 'warn';
  message: string;
  sessionId?: string;
}

export interface SessionFiles {
  prompts: string[];
  imagePrompts: string[];
  titles: string[];
}

export interface RunResult {
  ok: boolean;
  details?: string;
  error?: string;
  submittedCount?: number;
  failedCount?: number;
  downloadedCount?: number;
  skippedCount?: number;
  draftsFound?: number;
  lastDownloadedFile?: string;
  submitted?: number; // Alias for submittedCount
  failed?: number;    // Alias for failedCount
}

export interface DownloadedVideo {
  path: string;
  fileName: string;
  sessionName?: string;
  mtime: number;
}

export interface WatermarkFramesResult {
  frames: string[];
  tempDir: string;
}

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

export interface WatermarkDetectionFrame {
  path: string;
  width: number;
  height: number;
  rects: WatermarkRect[];
}

export interface WatermarkDetectionResult {
  frames: WatermarkDetectionFrame[];
  suggestedMask?: WatermarkMask;
}

export interface WatermarkCleanItemResult {
  video: string;
  output?: string;
  status: 'cleaned' | 'skipped' | 'error';
  message?: string;
}

export interface WatermarkCleanResult {
  ok: boolean;
  items: WatermarkCleanItemResult[];
  error?: string;
}

// --- Workflow Types ---

export type OpenWorkflowStepId = `openSession${string}`;
export type DownloadWorkflowStepId = `downloadSession${string}`;
export type PromptsWorkflowStepId = `promptsSession${string}`;
export type ProcessWorkflowStepId = `processSession${string}`;
export type BlurWorkflowStepId = `blurSession${string}`;
export type MergeWorkflowStepId = `mergeSession${string}`;

export type WorkflowStepId =
  | 'openSessions'
  | 'consolidateFiles'
  | OpenWorkflowStepId
  | DownloadWorkflowStepId
  | PromptsWorkflowStepId
  | ProcessWorkflowStepId
  | BlurWorkflowStepId
  | MergeWorkflowStepId
  | 'blurVideos' // Legacy global
  | 'mergeVideos' // Legacy global
  | 'cleanMetadata'; // Legacy global

// Generic Action Types
export type GenericActionType = 'click' | 'type' | 'wait' | 'navigate' | 'scroll';

export interface WorkflowClientStep {
  id: WorkflowStepId | string;
  label: string;
  enabled: boolean;
  dependsOn?: (WorkflowStepId | string)[];
  sessionId?: string;
  // Automator extra props
  blurProfileId?: string;
  mergeBatchSize?: number;
  
  // Generic Props
  type?: string; // 'generic', 'open', etc.
  action?: GenericActionType;
  selectorId?: string;
  value?: string;

  // Generic Loop Props
  promptMode?: 'sora' | 'generic';
  promptInputSelectorId?: string;
  submitSelectorId?: string;
}

export interface WorkflowProgress {
  stepId: WorkflowStepId | 'workflow';
  label: string;
  status: 'running' | 'success' | 'error' | 'skipped' | 'warning';
  message: string;
  timestamp: number;
  sessionId?: string;
  downloadedCount?: number;
}

export type PipelineMode = 'parallel-phases' | 'sequential-session' | 'parallel-prompts' | 'parallel-prompts-seq-downloads';

export function buildDynamicWorkflow(
  sessions: ManagedSession[],
  selectedSessionIds?: string[],
  mode: PipelineMode = 'parallel-phases'
): WorkflowClientStep[] {
  const selected =
    selectedSessionIds && selectedSessionIds.length > 0
      ? sessions.filter((session) => selectedSessionIds.includes(session.id))
      : sessions;

  const steps: WorkflowClientStep[] = [];

  // 1. Always start with opening sessions
  steps.push({ id: 'openSessions', label: 'Open all sessions', enabled: true });

  if (mode === 'parallel-phases') {
    // --- PARALLEL PHASES (Original) ---
    const downloadStepIds: DownloadWorkflowStepId[] = [];
    selected.forEach((session, index) => {
      const id = `downloadSession${index + 1}` as DownloadWorkflowStepId;
      downloadStepIds.push(id);
      steps.push({
        id,
        label: `Download (${session.name})`,
        enabled: true,
        dependsOn: ['openSessions'],
        sessionId: session.id,
      });
    });

    steps.push({ id: 'blurVideos', label: 'Blur videos', enabled: true, dependsOn: downloadStepIds });
    steps.push({ id: 'mergeVideos', label: 'Merge videos', enabled: true, dependsOn: ['blurVideos'] });
    
  } else if (mode === 'sequential-session') {
    // --- SEQUENTIAL SESSION ---
    let previousSessionStepId: WorkflowStepId = 'openSessions';

    selected.forEach((session) => {
      const sIdSuffix = session.id.replace(/-/g, '').slice(0, 8);
      const promptsId = `promptsSession${sIdSuffix}` as PromptsWorkflowStepId;
      
      steps.push({
        id: promptsId,
        label: `Prompts (${session.name})`,
        enabled: !!session.enableAutoPrompts,
        dependsOn: [previousSessionStepId],
        sessionId: session.id,
      });

      const downloadId = `downloadSession${sIdSuffix}` as DownloadWorkflowStepId;
      steps.push({
        id: downloadId,
        label: `Download (${session.name})`,
        enabled: true,
        dependsOn: [promptsId],
        sessionId: session.id,
      });

      // Add individual process step
      const processId = `processSession${sIdSuffix}` as ProcessWorkflowStepId;
      steps.push({
        id: processId,
        label: `Process (${session.name})`,
        enabled: true,
        dependsOn: [downloadId],
        sessionId: session.id
      });

      previousSessionStepId = processId;
    });

  } else if (mode === 'parallel-prompts') {
    // --- PARALLEL PROMPTS (Pure Parallel) ---
    
    const downloadStepIds: string[] = [];
    
    selected.forEach((session) => {
      const sIdSuffix = session.id.replace(/-/g, '').slice(0, 8);
      const promptsId = `promptsSession${sIdSuffix}` as PromptsWorkflowStepId;
      const downloadId = `downloadSession${sIdSuffix}` as DownloadWorkflowStepId;
      downloadStepIds.push(downloadId);

      // Prompts start after Open
      steps.push({
        id: promptsId,
        label: `Prompts (${session.name})`,
        enabled: !!session.enableAutoPrompts,
        dependsOn: ['openSessions'],
        sessionId: session.id,
      });

      // Downloads start after this session's prompts
      steps.push({
        id: downloadId,
        label: `Download (${session.name})`,
        enabled: true,
        dependsOn: [promptsId], 
        sessionId: session.id,
      });
    });
    
    steps.push({
        id: 'consolidateFiles',
        label: 'Consolidate All Files',
        enabled: false,
        dependsOn: downloadStepIds as any
    });

  } else if (mode === 'parallel-prompts-seq-downloads') {
    // --- PARALLEL PROMPTS -> SEQUENTIAL DOWNLOADS ---
    // 1. All Prompts start together after open
    // 2. Downloads start one by one, ensuring previous download is done AND own prompts are done.

    let previousDownloadStepId: string | null = null;
    const allDownloadIds: string[] = [];

    selected.forEach((session) => {
      const sIdSuffix = session.id.replace(/-/g, '').slice(0, 8);
      const promptsId = `promptsSession${sIdSuffix}` as PromptsWorkflowStepId;
      const downloadId = `downloadSession${sIdSuffix}` as DownloadWorkflowStepId;
      allDownloadIds.push(downloadId);

      // Prompts: Parallel (Depend only on Open)
      steps.push({
        id: promptsId,
        label: `Prompts (${session.name})`,
        enabled: !!session.enableAutoPrompts,
        dependsOn: ['openSessions'],
        sessionId: session.id,
      });

      // Download: Depends on (My Prompts) AND (Previous Session Download)
      const downloadDeps: WorkflowStepId[] = [promptsId];
      if (previousDownloadStepId) {
          downloadDeps.push(previousDownloadStepId as WorkflowStepId);
      }

      steps.push({
        id: downloadId,
        label: `Download (${session.name})`,
        enabled: true,
        dependsOn: downloadDeps,
        sessionId: session.id,
      });

      previousDownloadStepId = downloadId;
    });

    // Optional Consolidate at end
    steps.push({
        id: 'consolidateFiles',
        label: 'Consolidate All Files',
        enabled: false,
        dependsOn: allDownloadIds as any
    });
  }

  return steps;
}
