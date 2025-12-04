
import { execFile } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { logInfo } from '../logging/logger';
import { getConfig } from '../config/config';

const execFileAsync = promisify(execFile);

async function resolveFfmpegBinary(): Promise<string> {
  const config = await getConfig();
  return config.ffmpegPath || 'ffmpeg';
}

type MergeOptions = {
    batchSize?: number; // 0 = all
};

// Helper: Clean Metadata & Align (Standardization)
// Sora 1 logic: remove metadata, force even dimensions, set standard crf
async function cleanAndStandardize(input: string, output: string, ffmpegBin: string): Promise<void> {
    // -map_metadata -1: remove all metadata
    // -vf scale...: ensure dimensions are divisible by 2 (required for some encoders)
    // -c:v libx264 -crf 18 -preset fast: standard high quality re-encode
    // -c:a copy: keep audio
    const args = [
        '-y',
        '-i', input,
        '-map_metadata', '-1',
        '-movflags', '+faststart',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'veryfast',
        '-c:a', 'aac', // re-encode audio to be safe for concat
        output
    ];
    await execFileAsync(ffmpegBin, args);
}

export async function mergeVideosInDir(inputDir: string, outputDir: string, options: MergeOptions = {}): Promise<void> {
  const { batchSize = 0 } = options;
  const ffmpegBin = await resolveFfmpegBinary();

  // 1. Read and Sort by Creation Time (Oldest -> Newest)
  const entries = await fs.readdir(inputDir);
  const files = [];
  for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.mp4')) continue;
      const fullPath = path.join(inputDir, entry);
      const stats = await fs.stat(fullPath);
      files.push({ path: fullPath, mtime: stats.birthtimeMs || stats.mtimeMs, name: entry });
  }
  
  // Sort: Oldest first (ascending timestamp)
  files.sort((a, b) => a.mtime - b.mtime);

  if (files.length === 0) throw new Error('No videos to merge');

  await fs.mkdir(outputDir, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sora-merge-prep-'));

  logInfo('Merge', `Found ${files.length} files. Preparing batch merge (Batch Size: ${batchSize || 'ALL'})...`);

  // 2. Batching
  const chunks = [];
  if (batchSize > 0) {
      for (let i = 0; i < files.length; i += batchSize) {
          chunks.push(files.slice(i, i + batchSize));
      }
  } else {
      chunks.push(files);
  }

  // 3. Process chunks
  for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkIndex = i + 1;
      const concatListPath = path.join(tempDir, `list_${chunkIndex}.txt`);
      const concatLines = [];

      // Pre-process each file in chunk
      for (const file of chunk) {
          const cleanName = `clean_${path.basename(file.path)}`;
          const cleanPath = path.join(tempDir, cleanName);
          
          try {
              await cleanAndStandardize(file.path, cleanPath, ffmpegBin);
              // Escape for ffmpeg concat demuxer
              concatLines.push(`file '${cleanPath.replace(/'/g, "'\\''")}'`);
          } catch (e) {
              logInfo('Merge', `Skipping corrupt file ${file.name}: ${(e as Error).message}`);
          }
      }

      if (concatLines.length === 0) continue;

      await fs.writeFile(concatListPath, concatLines.join('\n'), 'utf-8');

      const outputName = chunks.length > 1 
          ? `merge_batch_${chunkIndex}_${Date.now()}.mp4`
          : `full_merge_${Date.now()}.mp4`;
          
      const finalPath = path.join(outputDir, outputName);

      // 4. Concat
      // -f concat -safe 0 -i list.txt -c copy
      // Since we standardized codecs above, stream copy is safe and fast now
      await execFileAsync(ffmpegBin, [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-c', 'copy',
          '-y',
          finalPath
      ]);
      
      logInfo('Merge', `Created: ${outputName}`);
  }

  // Cleanup temp
  try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
}
