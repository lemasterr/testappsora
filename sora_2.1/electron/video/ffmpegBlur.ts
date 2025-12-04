
import { exec as execCb } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

import { getConfig, getUserDataPath } from '../config/config';

export type BlurZone = {
  x: number; y: number; w: number; h: number;
  mode?: 'blur' | 'delogo' | 'hybrid';
  blur_strength?: number;
  band?: number;
};
export type BlurProfile = {
  id: string;
  name: string;
  zones: BlurZone[];
};

const exec = promisify(execCb);
const profilesFile = path.join(getUserDataPath(), 'blur-profiles.json');

async function ensureFfmpeg(): Promise<void> {
  const config = await getConfig();
  if (config.ffmpegPath) {
    ffmpeg.setFfmpegPath(config.ffmpegPath);
    return;
  }
  try { await exec('ffmpeg -version'); } catch { throw new Error('ffmpeg not found'); }
}

async function readProfiles(): Promise<BlurProfile[]> {
  try {
    const raw = await fs.readFile(profilesFile, 'utf-8');
    return JSON.parse(raw) as BlurProfile[];
  } catch { return []; }
}

async function writeProfiles(profiles: BlurProfile[]): Promise<void> {
  await fs.mkdir(path.dirname(profilesFile), { recursive: true });
  await fs.writeFile(profilesFile, JSON.stringify(profiles, null, 2), 'utf-8');
}

export async function listBlurProfiles(): Promise<BlurProfile[]> { return readProfiles(); }

export async function saveBlurProfile(profile: BlurProfile): Promise<BlurProfile> {
  const profiles = await readProfiles();
  const id = profile.id || randomUUID();
  const idx = profiles.findIndex((p) => p.id === id);
  const next = { ...profile, id };
  if (idx >= 0) profiles[idx] = next; else profiles.push(next);
  await writeProfiles(profiles);
  return next;
}

export async function deleteBlurProfile(id: string): Promise<void> {
  const profiles = await readProfiles();
  await writeProfiles(profiles.filter((p) => p.id !== id));
}

export async function blurVideo(input: string, output: string, zones: BlurZone[]): Promise<void> {
  await ensureFfmpeg();
  await fs.mkdir(path.dirname(output), { recursive: true });

  // Sora v1 Magic Formula Logic
  // 1. Delogo per zone (interpolates holes)
  // 2. Post-chain: boxblur=1:1 (smooth seams) -> noise (hide artifacts) -> unsharp (restore crispness)
  // 3. Force pixel format
  const POST_CHAIN = 'boxblur=1:1,noise=alls=2:allf=t,unsharp=3:3:0.5:3:3:0.0,format=yuv420p';

  // If no zones, just copy (or re-encode if we strictly want yuv420p)
  if (!zones.length) {
    await fs.copyFile(input, output);
    return;
  }

  const filters: string[] = [];
  let inputTag = '0:v';

  zones.forEach((z, idx) => {
    const x = Math.max(0, Math.floor(z.x));
    const y = Math.max(0, Math.floor(z.y));
    const w = Math.max(1, Math.floor(z.w));
    const h = Math.max(1, Math.floor(z.h));
    const outputTag = `v${idx}`;
    
    // show=0 ensures the box border is hidden
    filters.push(`[${inputTag}]delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0[${outputTag}]`);
    inputTag = outputTag;
  });

  // Attach post-chain to the last delogo output
  const finalTag = 'out';
  filters.push(`[${inputTag}]${POST_CHAIN}[${finalTag}]`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .complexFilter(filters)
      .outputOptions([
          '-map', `[${finalTag}]`, 
          '-map', '0:a?', 
          '-c:a', 'copy',
          '-y', // FORCE OVERWRITE (Fixes Error 234)
          '-max_muxing_queue_size', '1024' // Prevent buffer underflows
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(output);
  });
}

export async function blurVideoWithProfile(input: string, output: string, profileId: string): Promise<void> {
  const profiles = await readProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(`Blur profile not found`);
  await blurVideo(input, output, profile.zones);
}
