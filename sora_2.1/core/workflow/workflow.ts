
import { performance } from 'perf_hooks';
import { logError, logStep } from '../utils/log';

export interface WorkflowStep {
  id: string;
  label: string;
  enabled: boolean;
  run: () => Promise<void | { message?: string; downloadedCount?: number }>;
  dependsOn?: string[];
  sessionId?: string;
}

export type WorkflowRunStatus = 'running' | 'success' | 'error' | 'skipped' | 'pending' | 'warning';

export interface WorkflowProgressEvent {
  stepId: string;
  label: string;
  status: WorkflowRunStatus;
  message: string;
  timestamp: number;
  sessionId?: string;
  downloadedCount?: number;
}

export interface WorkflowRunResult {
  stepId: string;
  label: string;
  status: WorkflowRunStatus;
  error?: string;
  durationMs: number;
}

export interface WorkflowRunOptions {
  onProgress?: (event: WorkflowProgressEvent) => void;
  logger?: (message: string) => void;
  shouldCancel?: () => boolean;
}

function emitProgress(
  step: Pick<WorkflowStep, 'id' | 'label' | 'sessionId'>,
  status: WorkflowRunStatus,
  message: string,
  options: WorkflowRunOptions,
  downloadedCount?: number
): void {
  options.logger?.(`[workflow] ${step.label}: ${message}`);
  options.onProgress?.({
    stepId: step.id,
    label: step.label,
    status,
    message,
    timestamp: Date.now(),
    sessionId: step.sessionId,
    downloadedCount,
  });
}

/**
 * Runs workflow steps allowing for parallel execution based on dependencies.
 */
export async function runWorkflow(
  steps: WorkflowStep[],
  options: WorkflowRunOptions = {}
): Promise<WorkflowRunResult[]> {
  const results: WorkflowRunResult[] = [];
  const statusById = new Map<string, WorkflowRunStatus>();
  const runningPromises = new Map<string, Promise<void>>();
  
  // Initially all enabled steps are pending
  const pendingSteps = new Set(steps);

  // Mark disabled steps as skipped immediately
  for (const step of steps) {
    if (!step.enabled) {
      statusById.set(step.id, 'skipped');
      results.push({ stepId: step.id, label: step.label, status: 'skipped', durationMs: 0 });
      emitProgress(step, 'skipped', 'Step disabled, skipping', options);
      pendingSteps.delete(step);
    } else {
      statusById.set(step.id, 'pending');
    }
  }

  while (pendingSteps.size > 0 || runningPromises.size > 0) {
    // Check Cancellation
    if (options.shouldCancel?.()) {
      for (const step of pendingSteps) {
        statusById.set(step.id, 'skipped');
        results.push({ stepId: step.id, label: step.label, status: 'skipped', durationMs: 0, error: 'Cancelled' });
        emitProgress(step, 'skipped', 'Workflow cancelled', options);
      }
      pendingSteps.clear();
      // We still wait for currently running steps to settle (graceful shutdown)
      if (runningPromises.size > 0) {
        await Promise.allSettled(runningPromises.values());
      }
      break;
    }

    // Find steps ready to run
    const readySteps: WorkflowStep[] = [];
    
    for (const step of pendingSteps) {
      const deps = step.dependsOn || [];
      
      // Check if dependencies failed
      const anyDepFailed = deps.some(depId => {
        const s = statusById.get(depId);
        return s === 'error' || s === 'skipped';
      });

      if (anyDepFailed) {
        statusById.set(step.id, 'skipped');
        results.push({ stepId: step.id, label: step.label, status: 'skipped', durationMs: 0, error: 'Dependency failed' });
        emitProgress(step, 'skipped', 'Skipped due to dependency failure', options);
        pendingSteps.delete(step);
        continue;
      }

      // Check if dependencies succeeded
      const allDepsSuccess = deps.every(depId => statusById.get(depId) === 'success');
      
      if (allDepsSuccess) {
        readySteps.push(step);
      }
    }

    // Launch ready steps
    for (const step of readySteps) {
      pendingSteps.delete(step);
      
      const promise = (async () => {
        const start = performance.now();
        statusById.set(step.id, 'running');
        emitProgress(step, 'running', 'Starting', options);
        logStep(`Workflow step start: ${step.label}`);

        try {
          const result = await step.run();
          const durationMs = Math.round(performance.now() - start);
          
          const downloadedCount = typeof result === 'object' && result?.downloadedCount !== undefined 
            ? result.downloadedCount : undefined;
          const customMsg = typeof result === 'object' && result?.message ? result.message : `Finished in ${durationMs}ms`;

          statusById.set(step.id, 'success');
          results.push({ stepId: step.id, label: step.label, status: 'success', durationMs });
          emitProgress(step, 'success', customMsg, options, downloadedCount);
          logStep(`Workflow step success: ${step.label}`);
        } catch (error) {
          const durationMs = Math.round(performance.now() - start);
          const message = (error as Error).message ?? 'Unknown error';
          statusById.set(step.id, 'error');
          results.push({ stepId: step.id, label: step.label, status: 'error', durationMs, error: message });
          emitProgress(step, 'error', message, options);
          logError(`Workflow step failed: ${step.label}`, error);
        } finally {
          runningPromises.delete(step.id);
        }
      })();

      runningPromises.set(step.id, promise);
    }

    // If nothing running and nothing ready but pending exists -> Deadlock (circular dependency or logic error)
    if (runningPromises.size === 0 && pendingSteps.size > 0) {
        for (const step of pendingSteps) {
            statusById.set(step.id, 'error');
            results.push({ stepId: step.id, label: step.label, status: 'error', durationMs: 0, error: 'Deadlock: dependencies never met' });
            emitProgress(step, 'error', 'Deadlock detected', options);
        }
        break;
    }

    if (runningPromises.size === 0 && pendingSteps.size === 0) {
        break;
    }

    // Wait for at least one running task to complete before next tick
    // We use Promise.race on the values. We wrapped them to remove themselves from map on completion.
    if (runningPromises.size > 0) {
        await Promise.race(runningPromises.values());
    }
  }

  return results;
}
