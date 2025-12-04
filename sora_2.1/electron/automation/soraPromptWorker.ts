// This file is deprecated. Logic moved to sessionAutomation.ts and promptsRunner.ts for unified control.
// It is kept as a placeholder to prevent import errors during transition if any old references exist,
// but all active logic should use runPromptsAdapter.

export async function runPromptsForSessionOldStyle(
  session: any,
  maxDownloads: number = 0
): Promise<{ ok: boolean; message: string }> {
  throw new Error("Deprecated. Please restart the app to use the new pipeline engine.");
}
