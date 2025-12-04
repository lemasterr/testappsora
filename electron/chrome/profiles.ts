
import fs from 'fs/promises';
import path from 'path';

import {
  type ChromeProfile as CoreChromeProfile,
  scanProfiles as coreScanProfiles,
} from '../../core/chrome/profiles';
import { getConfig, updateConfig } from '../config/config';
import { logError, logInfo } from '../logging/logger';
import { ensureDir } from '../utils/fs';

export type ChromeProfile = {
  id: string;
  name: string;
  userDataDir: string;
  profileDirectory: string;
  profileDir?: string;
  path?: string;
  isDefault?: boolean;
  lastUsed?: string;
  isActive?: boolean;
};

export type SessionProfilePreference = {
  chromeProfileName?: string | null;
  userDataDir?: string | null;
  profileDirectory?: string | null;
  sessionId?: string | null; 
};

let cachedProfiles: ChromeProfile[] | null = null;

type VerificationResult = { ok: boolean; reason?: string };

function mapCoreProfile(profile: CoreChromeProfile): ChromeProfile {
  const profileDirectory = path.basename(profile.path);
  const userDataDir = path.dirname(profile.path);

  return {
    id: profile.id,
    name: profile.name,
    userDataDir,
    profileDirectory,
    profileDir: profileDirectory,
    isDefault: profile.isDefault ?? profileDirectory === 'Default',
    path: profile.path,
  };
}

function mapCoreProfiles(profiles: CoreChromeProfile[]): ChromeProfile[] {
  return profiles.map(mapCoreProfile);
}

function slugifyProfileName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/gi, '');
  return normalized.length > 0 ? normalized : 'profile';
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch (error) {
    if ((error as Error & { code?: string })?.code === 'ENOENT') return false;
    throw error;
  }
}

// Robust copy that handles locked files by retrying briefly
async function safeCopyFile(src: string, dest: string) {
  for (let i = 0; i < 3; i++) {
    try {
      await fs.copyFile(src, dest);
      return;
    } catch (e: any) {
      // If locked, wait and retry
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        await new Promise(r => setTimeout(r, 200 * (i + 1)));
      } else {
        break; 
      }
    }
  }
  // Final attempt or ignore
  try { await fs.copyFile(src, dest); } catch {}
}

export async function ensureCloneSeededFromProfile(
  profile: ChromeProfile,
  cloneDir: string
): Promise<void> {
  // LOGIC: Flatten source profile into 'Default' folder in the clone.
  // This ensures Chrome treats it as the main profile for this user-data-dir.
  const targetDefaultDir = path.join(cloneDir, 'Default');
  
  // Source path resolution
  // profile.path usually points to .../User Data/Profile X
  const sourceProfileDir = profile.path || path.join(profile.userDataDir, profile.profileDirectory || 'Default');
  const sourceUserDataDir = profile.userDataDir;

  logInfo('ChromeProfile', `Seeding clone from ${sourceProfileDir} to ${targetDefaultDir}`);

  await ensureDir(targetDefaultDir);

  // 1. Copy 'Local State' (CRITICAL for Cookie Decryption on Windows/Linux)
  // This must go to the User Data Root (cloneDir), NOT the profile folder (targetDefaultDir).
  const localStateSrc = path.join(sourceUserDataDir, 'Local State');
  const localStateDest = path.join(cloneDir, 'Local State');
  
  if (await pathExists(localStateSrc)) {
      await safeCopyFile(localStateSrc, localStateDest);
  } else {
      logInfo('ChromeProfile', `Warning: Source Local State not found at ${localStateSrc}`);
  }

  // 2. Critical files for session persistence
  // These go into the 'Default' folder
  const criticalFiles = [
      'Cookies', 
      'Login Data', 
      'Web Data', 
      'Preferences', 
      'Secure Preferences',
      'Network Action Predictor',
      'Network Persistence', 
      'Extension Cookies' 
  ];
  
  for (const file of criticalFiles) {
      const src = path.join(sourceProfileDir, file);
      const dest = path.join(targetDefaultDir, file);
      if (await pathExists(src)) {
          await safeCopyFile(src, dest);
      }
  }

  // 3. Remove SingletonLock/Lockfile to prevent "Profile in use" crashes
  const locks = ['SingletonLock', 'SingletonCookie', 'Lock'];
  
  for (const lock of locks) {
      const lockFile = path.join(targetDefaultDir, lock);
      const rootLockFile = path.join(cloneDir, lock);
      if (await pathExists(lockFile)) try { await fs.unlink(lockFile); } catch {}
      if (await pathExists(rootLockFile)) try { await fs.unlink(rootLockFile); } catch {}
  }
}

function annotateActive(
  profiles: ChromeProfile[],
  activeId?: string | null,
  activeUserDataDir?: string | null
): ChromeProfile[] {
  return profiles.map((profile) => {
    const matchesName = activeId ? profile.profileDirectory === activeId || profile.id === activeId : false;
    const matchesDir = activeUserDataDir ? profile.userDataDir === activeUserDataDir : true;
    return {
      ...profile,
      isActive: matchesName && matchesDir,
    };
  });
}

export async function resolveProfileLaunchTarget(
  profile: ChromeProfile,
  sessionId?: string
): Promise<{ userDataDir: string; profileDirectoryArg: string }> {
  const config = await getConfig();
  const cloneRoot =
    config.chromeClonedProfilesRoot || path.join(config.sessionsRoot, 'chrome-clones');

  await ensureDir(cloneRoot);

  const baseName = profile.profileDirectory || profile.name || profile.id;
  const sessionSuffix = sessionId ? `_${sessionId.slice(0, 8)}` : '';
  const slug = slugifyProfileName(`${baseName}${sessionSuffix}`);

  const userDataDir = path.join(cloneRoot, slug);

  await ensureDir(userDataDir);
  
  // We explicitly return 'Default' because ensureCloneSeededFromProfile flattens everything to 'Default'.
  return { userDataDir, profileDirectoryArg: 'Default' };
}

export async function verifyProfileClone(
  cloneDir: string,
  profileDirName = 'Default'
): Promise<VerificationResult> {
  try {
    // Check root Local State (essential for cookies)
    const localStatePath = path.join(cloneDir, 'Local State');
    if (!(await pathExists(localStatePath))) return { ok: false, reason: 'Local State missing' };

    const profilePath = path.join(cloneDir, profileDirName);
    const stats = await fs.stat(profilePath);
    if (!stats.isDirectory()) return { ok: false, reason: 'Not a directory' };
    
    // Check for Cookies to consider it seeded
    if (await pathExists(path.join(profilePath, 'Cookies'))) {
        return { ok: true };
    }
    return { ok: false, reason: 'Cookies missing' };
  } catch {
    return { ok: false, reason: 'Clone missing' };
  }
}

export async function scanChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();
  const coreProfiles = coreScanProfiles();
  const mapped = mapCoreProfiles(coreProfiles);

  const annotated = annotateActive(
    mapped,
    config.chromeProfileId ?? config.chromeActiveProfileName ?? undefined,
    config.chromeUserDataRoot ?? config.chromeUserDataDir ?? undefined
  );

  cachedProfiles = annotated;
  return annotated;
}

export async function setActiveChromeProfile(name: string): Promise<void> {
  const profiles = cachedProfiles ?? (await scanChromeProfiles());
  const match = profiles.find((p) => p.name === name || p.profileDirectory === name || p.id === name);

  if (!match) throw new Error(`Profile "${name}" not found`);

  const config = await updateConfig({
    chromeActiveProfileName: match.name,
    chromeProfileId: match.profileDirectory,
    chromeUserDataRoot: match.userDataDir,
    chromeUserDataDir: match.userDataDir,
  });

  cachedProfiles = annotateActive(profiles, match.profileDirectory, config.chromeUserDataDir ?? undefined);
}

export async function resolveChromeProfileForSession(
  preference?: SessionProfilePreference
): Promise<ChromeProfile | null> {
  const [profiles, config] = await Promise.all([scanChromeProfiles(), getConfig()]);

  const desiredName = preference?.chromeProfileName ?? config.chromeProfileId ?? config.chromeActiveProfileName ?? null;
  
  if (desiredName) {
      const match = profiles.find(p => p.name === desiredName || p.profileDirectory === desiredName);
      if (match) return match;
  }

  const active = profiles.find(p => p.isActive) || profiles.find(p => p.isDefault) || profiles[0];
  return active || null;
}

export async function cloneActiveChromeProfile(): Promise<{ ok: boolean; profile?: ChromeProfile; message?: string; error?: string }> {
    return { ok: true, message: "Cloning is handled automatically per session now." };
}

export async function listChromeProfiles(): Promise<ChromeProfile[]> {
  const config = await getConfig();
  const profiles = await scanChromeProfiles();
  cachedProfiles = annotateActive(profiles, config.chromeActiveProfileName ?? undefined, config.chromeUserDataDir ?? undefined);
  return cachedProfiles;
}
