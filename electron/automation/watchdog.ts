
import { setInterval as setIntervalSafe, clearInterval } from 'node:timers';

type WatchdogEntry = {
  lastHeartbeat: number;
  timeoutMs: number;
  interval: any;
  onTimeout: () => Promise<void> | void;
};

const WATCHDOG_CHECK_INTERVAL_MS = 5000;
const watchers = new Map<string, WatchdogEntry>();

export function startWatchdog(
  runId: string,
  timeoutMs: number,
  onTimeout: () => Promise<void> | void
): void {
  stopWatchdog(runId);
  const entry: WatchdogEntry = {
    lastHeartbeat: Date.now(),
    timeoutMs,
    interval: setIntervalSafe(async () => {
      const now = Date.now();
      const current = watchers.get(runId);
      if (!current) return;
      if (now - current.lastHeartbeat > current.timeoutMs) {
        try {
          await current.onTimeout();
        } catch (e) {
          console.error('Watchdog callback failed', e);
        } finally {
          // Snooze the watchdog instead of killing it.
          // This gives the process another cycle to recover or fail again.
          if (watchers.has(runId)) {
             const active = watchers.get(runId);
             if (active) active.lastHeartbeat = Date.now();
          }
        }
      }
    }, WATCHDOG_CHECK_INTERVAL_MS),
    onTimeout,
  };
  watchers.set(runId, entry);
}

export function heartbeat(runId: string): void {
  const entry = watchers.get(runId);
  if (entry) {
    entry.lastHeartbeat = Date.now();
  }
}

export function stopWatchdog(runId: string): void {
  const entry = watchers.get(runId);
  if (entry) {
    clearInterval(entry.interval);
    watchers.delete(runId);
  }
}
