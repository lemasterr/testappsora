
import { type Browser, type Page } from 'puppeteer-core';
// Re-exporting from the central sessionAutomation now for consistency, 
// but keeping basic types if needed by other modules.
// The logic has been moved to sessionAutomation.ts to unify the control flow.
// This file remains to support any legacy imports but implementation logic is in sessionAutomation.ts

export { runPrompts, cancelSessionRun as cancelPrompts } from './sessionAutomation';
export type { PromptsRunResult } from './sessionAutomation'; // Assuming you export it there or redefine here if needed
