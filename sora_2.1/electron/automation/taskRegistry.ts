
import { logInfo, logWarn } from '../logging/logger';

type TaskType = 'prompts' | 'download' | 'pipeline';

interface ActiveTask {
  type: TaskType;
  controller: AbortController;
  startTime: number;
}

const registry = new Map<string, ActiveTask>();

export function startTask(sessionId: string, type: TaskType): AbortSignal {
  // If a task is already running, cancel it first to restart clean
  if (registry.has(sessionId)) {
    logWarn('TaskRegistry', `Session ${sessionId} busy. Stopping previous task...`);
    stopTask(sessionId);
  }

  const controller = new AbortController();
  registry.set(sessionId, {
    type,
    controller,
    startTime: Date.now()
  });

  logInfo('TaskRegistry', `Started task [${type}] for session ${sessionId}`);
  return controller.signal;
}

export function stopTask(sessionId: string): void {
  const task = registry.get(sessionId);
  if (task) {
    logInfo('TaskRegistry', `Stopping task [${task.type}] for session ${sessionId}`);
    task.controller.abort();
    registry.delete(sessionId);
  }
}

export function cancelAllTasks(): void {
    logInfo('TaskRegistry', `Force stopping all ${registry.size} active session tasks (Skip Step)`);
    for (const [sessionId, task] of registry.entries()) {
        task.controller.abort();
        registry.delete(sessionId);
    }
}

export function isTaskRunning(sessionId: string): boolean {
  return registry.has(sessionId);
}

export function getRunningTaskType(sessionId: string): TaskType | null {
  return registry.get(sessionId)?.type || null;
}