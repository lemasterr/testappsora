
import path from 'path';
import fs from 'fs/promises';

import { runWorkflow, type WorkflowStep, type WorkflowRunOptions } from '../../core/workflow/workflow';
import {
  buildDynamicWorkflow,
  type ManagedSession,
  type WorkflowClientStep,
  type WorkflowProgress,
  type WorkflowStepId,
} from '../../shared/types';
import { getSessionPaths, listSessions } from '../sessions/repo';
import type { Session } from '../sessions/types';
import { ensureBrowserForSession } from './sessionChrome';
import { runDownloads } from './downloader';
// Use the new adapter instead of the old worker
import { runPromptsAdapter } from './sessionAutomation';
import { cancelAllTasks } from './taskRegistry';

import { logInfo, logWarn, logError } from '../logging/logger';
import { logError as logFileError } from '../../core/utils/log';
import { getConfig } from '../config/config';

import { pythonBlur, pythonCleanMetadata } from '../integrations/pythonClient';
import { mergeVideosInDir } from '../video/ffmpegMerge';

let cancelled = false;

// Store dynamic limits set by prompt steps
const sessionDownloadLimits = new Map<string, number>();

function emitProgress(onProgress: (status: WorkflowProgress) => void, progress: WorkflowProgress): void {
  try {
    onProgress({ ...progress, timestamp: Date.now() });
  } catch (error) {
    logFileError('Workflow progress emit failed', error);
  }
}

function toSession(managed: ManagedSession): Session {
  const { status: _status, promptCount: _promptCount, titleCount: _titleCount, hasFiles: _hasFiles, ...rest } = managed;
  return rest;
}

// Dynamically assign ports to ensure parallel execution without collisions
function assignRuntimePorts(sessions: Session[]): Session[] {
  const usedPorts = new Set<number>();
  
  // 1. Reserve explicitly configured ports
  for (const s of sessions) {
    if (s.cdpPort && Number.isFinite(s.cdpPort) && s.cdpPort > 0) {
      usedPorts.add(s.cdpPort);
    }
  }

  let nextPort = 9222;
  
  return sessions.map(s => {
    if (s.cdpPort && Number.isFinite(s.cdpPort) && s.cdpPort > 0) {
      return s; // Keep fixed port
    }
    
    // Find next free port
    while (usedPorts.has(nextPort)) {
      nextPort++;
    }
    
    usedPorts.add(nextPort);
    return { ...s, cdpPort: nextPort };
  });
}

// --- Step Executors ---

async function runDownloadForSession(session: Session, maxOverride?: number): Promise<{ message: string; downloadedCount: number }> {
  let effectiveLimit = 0;

  if (sessionDownloadLimits.has(session.id)) {
      effectiveLimit = sessionDownloadLimits.get(session.id)!;
      logInfo('Pipeline', `Using dynamic download limit from prompts: ${effectiveLimit}`);
  } 
  else if (Number.isFinite(maxOverride) && (maxOverride as number) > 0) {
      effectiveLimit = maxOverride as number;
  } 
  else if (Number.isFinite(session.maxVideos) && session.maxVideos > 0) {
      effectiveLimit = session.maxVideos;
  }

  const result = await runDownloads(session, effectiveLimit);
  if (!result.ok) {
    if (result.error === 'Cancelled') return { message: 'Downloads skipped', downloadedCount: result.downloaded };
    throw new Error(result.error ?? 'Download failed');
  }

  const downloaded = typeof result.downloaded === 'number' ? result.downloaded : 0;
  const label = session.name || session.id;
  return { message: `Downloaded ${downloaded} for ${label}`, downloadedCount: downloaded };
}

async function runPromptsForSession(
    session: Session, 
    stepId: string, 
    onProgress?: (event: WorkflowProgress) => void
): Promise<{ message: string }> {
  const limit = Number.isFinite(session.maxVideos) && session.maxVideos > 0 ? session.maxVideos : 0;
  
  const result = await runPromptsAdapter(session, limit, (msg, status) => {
      // Bubble status update to UI
      if (onProgress) {
          onProgress({
              stepId: stepId as any,
              label: `Prompts (${session.name})`,
              status: status || 'running',
              message: msg,
              timestamp: Date.now(),
              sessionId: session.id
          });
      }
  });

  if (!result.ok) {
    throw new Error(result.message ?? 'Prompts/Generation loop failed');
  }

  if (typeof result.submittedCount === 'number') {
      sessionDownloadLimits.set(session.id, result.submittedCount);
      logInfo('Pipeline', `Set download limit for session ${session.id} to ${result.submittedCount} (based on submitted prompts)`);
  }

  if (!cancelled) {
      if (onProgress) {
          onProgress({
              stepId: stepId as any,
              label: `Prompts (${session.name})`,
              status: 'running',
              message: 'Cooldown: Waiting 3 min for generation...',
              timestamp: Date.now(),
              sessionId: session.id
          });
      }
      logInfo('Pipeline', `Prompts finished. Waiting 3 minutes for generation completion...`);
      await new Promise(resolve => setTimeout(resolve, 180_000));
  }

  return { message: result.message };
}

async function runBlurForSession(session: Session, profileId?: string): Promise<{ message: string }> {
    const paths = await getSessionPaths(session);
    const config = await getConfig();
    
    const activeMaskId = profileId || config.activeWatermarkMaskId;
    const activeMask = config.watermarkMasks?.find(m => m.id === activeMaskId);
    
    const dfl = config.watermarkDefaults || {};
    let blurConfig: any = { zones: [] };

    if (activeMask) {
        blurConfig.zones = activeMask.rects.map((r: any) => ({
            x: r.x, y: r.y, w: r.width ?? r.w, h: r.height ?? r.h,
            mode: dfl.watermark_mode ?? 'blur',
            blur_strength: dfl.blur_strength ?? 20,
            band: dfl.band ?? 4
        }));
    } else if (dfl.watermark_mode && (dfl.w ?? 0) > 0) {
        blurConfig.zones = [{
            x: dfl.x, y: dfl.y, w: dfl.w, h: dfl.h,
            mode: dfl.watermark_mode,
            blur_strength: dfl.blur_strength,
            band: dfl.band
        }];
    }

    const sourceDir = paths.downloadDir;
    const targetDir = path.join(paths.cleanDir, 'blurred');
    
    const res = await pythonBlur(sourceDir, targetDir, blurConfig);
    if (!res.ok) throw new Error(res.error);
    return { message: 'Blur complete' };
}

async function runCleanMetadataForSession(session: Session): Promise<{ message: string }> {
    const paths = await getSessionPaths(session);
    const res = await pythonCleanMetadata(paths.downloadDir);
    if (!res.ok) throw new Error(res.error);
    return { message: 'Metadata cleaned' };
}

async function runMergeForSession(session: Session, batchSizeOverride?: number): Promise<{ message: string }> {
    const paths = await getSessionPaths(session);
    const config = await getConfig();
    const blurredDir = path.join(paths.cleanDir, 'blurred');
    const hasBlurred = (await fs.readdir(blurredDir).catch(() => [])).length > 0;
    const inputDir = hasBlurred ? blurredDir : paths.downloadDir;
    
    const sessionBatch = session.mergeBatchSize ?? 0;
    const globalBatch = config.mergeBatchSize ?? 0;
    const effectiveBatchSize = (batchSizeOverride && batchSizeOverride > 0) 
        ? batchSizeOverride 
        : (sessionBatch > 0 ? sessionBatch : globalBatch);
    
    await mergeVideosInDir(inputDir, paths.cleanDir, { batchSize: effectiveBatchSize });
    
    const msg = effectiveBatchSize > 0 
        ? `Merge complete (Batch size: ${effectiveBatchSize})` 
        : 'Merge complete (All videos consolidated)';
        
    return { message: msg };
}

async function runConsolidateFiles(sessions: Session[]): Promise<{ message: string }> {
    const config = await getConfig();
    const globalMergeDir = path.join(config.sessionsRoot, '_GLOBAL_MERGE_');
    await fs.mkdir(globalMergeDir, { recursive: true });
    
    let count = 0;
    for (const session of sessions) {
        const paths = await getSessionPaths(session);
        const possibleDirs = [path.join(paths.cleanDir, 'blurred'), paths.downloadDir];
        
        for (const dir of possibleDirs) {
            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (file.toLowerCase().endsWith('.mp4')) {
                        const src = path.join(dir, file);
                        const dest = path.join(globalMergeDir, `${session.name.replace(/\s/g,'_')}_${file}`);
                        await fs.copyFile(src, dest);
                        count++;
                    }
                }
                if (files.some(f => f.toLowerCase().endsWith('.mp4'))) break; 
            } catch {}
        }
    }
    return { message: `Consolidated ${count} videos to _GLOBAL_MERGE_` };
}

async function runOpenSessions(targetSessions: Session[]): Promise<void> {
  logInfo('Pipeline', `Opening ${targetSessions.length} sessions sequentially...`);
  
  for (const session of targetSessions) {
      if (cancelled) break;
      try {
          logInfo('Pipeline', `Opening session: ${session.name} (${session.id})`);
          await ensureBrowserForSession(session);
          logInfo('Pipeline', `Session ${session.name} opened successfully.`);
          await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
          logError('Pipeline', `Failed to open session ${session.name}: ${(e as Error).message}`);
      }
  }
}

async function runOpenSession(session: Session): Promise<{ message: string }> {
  await ensureBrowserForSession(session);
  return { message: `Chrome launched for ${session.name}` };
}

// --- Pipeline Builder ---

function normalizeClientSteps(
  steps: unknown,
  availableSessions: ManagedSession[]
): { normalized: WorkflowClientStep[]; activeSessionIds: string[] } {
  if (!Array.isArray(steps)) {
    const defaultSteps = buildDynamicWorkflow(availableSessions, undefined, 'parallel-phases');
    const active = availableSessions.map(s => s.id);
    return { normalized: defaultSteps, activeSessionIds: active };
  }

  const normalized: WorkflowClientStep[] = steps.map((s: any) => ({
    id: s.id,
    label: s.label,
    enabled: s.enabled,
    dependsOn: s.dependsOn,
    sessionId: s.sessionId,
    blurProfileId: s.blurProfileId,
    mergeBatchSize: s.mergeBatchSize
  }));

  const activeSessionIds = Array.from(new Set(
    normalized.filter(s => s.sessionId).map(s => s.sessionId!)
  ));

  return { normalized, activeSessionIds };
}

function buildWorkflowSteps(
  selection: WorkflowClientStep[],
  sessionLookup: Map<string, Session>,
  pipelineOptions: { dryRun?: boolean; scenarioDownloadLimit?: number | null; onProgress?: (e: WorkflowProgress) => void }
): WorkflowStep[] {

  const resolveSession = (step: WorkflowClientStep): Session => {
    if (step.sessionId && sessionLookup.has(step.sessionId)) {
      return sessionLookup.get(step.sessionId)!;
    }
    throw new Error(`Session not found for step ${step.id}`);
  };

  const allSessions = Array.from(sessionLookup.values());
  let remainingDownload = (pipelineOptions.scenarioDownloadLimit && pipelineOptions.scenarioDownloadLimit > 0)
    ? pipelineOptions.scenarioDownloadLimit
    : Number.POSITIVE_INFINITY;
  const isDry = !!pipelineOptions.dryRun;

  return selection.map((step) => {
    const sid = String(step.id);

    if (sid === 'openSessions') {
      return {
        id: step.id,
        label: step.label,
        enabled: step.enabled,
        run: () => isDry ? Promise.resolve() : runOpenSessions(allSessions),
      };
    }
    
    if (sid === 'consolidateFiles') {
        return {
            id: step.id,
            label: step.label,
            enabled: step.enabled,
            dependsOn: step.dependsOn,
            run: () => isDry ? Promise.resolve({ message: 'Dry run consolidate' }) : runConsolidateFiles(allSessions)
        };
    }

    if (sid.startsWith('openSession')) {
      return {
        id: step.id,
        label: step.label,
        enabled: step.enabled,
        dependsOn: step.dependsOn,
        sessionId: step.sessionId,
        run: () => isDry ? Promise.resolve({ message: 'Dry open' }) : runOpenSession(resolveSession(step))
      };
    }

    if (sid.startsWith('promptsSession')) {
      return {
        id: step.id,
        label: step.label,
        enabled: step.enabled,
        dependsOn: step.dependsOn,
        sessionId: step.sessionId,
        run: () => isDry ? Promise.resolve() : runPromptsForSession(resolveSession(step), step.id as string, pipelineOptions.onProgress)
      };
    }

    if (sid.startsWith('downloadSession')) {
      return {
        id: step.id,
        label: step.label,
        enabled: step.enabled,
        dependsOn: step.dependsOn,
        sessionId: step.sessionId,
        run: async () => {
          const s = resolveSession(step);
          if (isDry) return { message: 'Dry download', downloadedCount: 0 };
          const maxForThis = Number.isFinite(remainingDownload) ? Math.max(0, remainingDownload) : undefined;
          const res = await runDownloadForSession(s, maxForThis);
          if (Number.isFinite(remainingDownload)) {
            remainingDownload = Math.max(0, (remainingDownload as number) - (res.downloadedCount || 0));
          }
          return res;
        }
      };
    }

    if (sid.startsWith('processSession') || sid.startsWith('blurSession')) {
        return {
            id: step.id,
            label: step.label,
            enabled: step.enabled,
            dependsOn: step.dependsOn,
            sessionId: step.sessionId,
            run: () => isDry ? Promise.resolve() : runBlurForSession(resolveSession(step), step.blurProfileId)
        };
    }

    if (sid.startsWith('cleanMetadataSession')) {
        return {
            id: step.id,
            label: step.label,
            enabled: step.enabled,
            dependsOn: step.dependsOn,
            sessionId: step.sessionId,
            run: () => isDry ? Promise.resolve() : runCleanMetadataForSession(resolveSession(step))
        };
    }
    
    if (sid.startsWith('mergeSession')) {
        return {
            id: step.id,
            label: step.label,
            enabled: step.enabled,
            dependsOn: step.dependsOn,
            sessionId: step.sessionId,
            run: () => isDry ? Promise.resolve() : runMergeForSession(resolveSession(step), step.mergeBatchSize)
        };
    }

    throw new Error(`Unknown workflow step: ${sid}`);
  });
}

export async function runPipeline(
  steps: WorkflowClientStep[],
  onProgress: (status: WorkflowProgress) => void
): Promise<void> {
  cancelled = false;
  sessionDownloadLimits.clear();

  const managedSessions = await listSessions();
  const sessionList = managedSessions.map((managed) => toSession(managed));
  const sessionsWithPorts = assignRuntimePorts(sessionList);
  const sessionLookup = new Map(sessionsWithPorts.map((session) => [session.id, session]));

  const { normalized } = normalizeClientSteps(steps, managedSessions);
  const validSteps = normalized.filter(step => {
      if (!step.sessionId) return true;
      if (sessionLookup.has(step.sessionId)) return true;
      logWarn('Pipeline', `Skipping step "${step.label}" - Session ${step.sessionId} not found.`);
      return false;
  });

  const config = await getConfig();
  const dryRun = !!(config.automator?.dryRun);
  const scenarioLimit = config.globalDownloadLimit ?? (config.automator?.downloadLimit);

  emitProgress(onProgress, { stepId: 'workflow', label: 'Workflow', status: 'running', message: 'Workflow starting', timestamp: Date.now() });

  try {
    const wrappedOnProgress = (event: WorkflowProgress) => emitProgress(onProgress, event);
    const workflowSteps = buildWorkflowSteps(validSteps, sessionLookup, { dryRun, scenarioDownloadLimit: scenarioLimit, onProgress: wrappedOnProgress });
    
    const results = await runWorkflow(workflowSteps, {
      onProgress: (event) => {
          // Adapt generic runner event to app-specific event
          // Cast string stepId to WorkflowStepId (or specific type union)
          const appEvent: WorkflowProgress = {
              ...event,
              stepId: event.stepId as any,
              status: event.status as any
          };
          emitProgress(onProgress, appEvent);
      },
      logger: (msg) => logInfo('Pipeline', msg),
      shouldCancel: () => cancelled,
    });

    const hadError = results.some((result) => result.status === 'error');
    const finalStatus = cancelled || hadError ? 'error' : 'success';
    emitProgress(onProgress, {
      stepId: 'workflow',
      label: 'Workflow',
      status: finalStatus,
      message: cancelled ? 'Workflow cancelled' : hadError ? 'Workflow finished with errors' : 'Workflow complete',
      timestamp: Date.now(),
    });
  } catch (error) {
    emitProgress(onProgress, { stepId: 'workflow', label: 'Workflow', status: 'error', message: (error as Error).message, timestamp: Date.now() });
  }
}

export function cancelPipeline(): void {
  cancelled = true;
  cancelAllTasks();
}
