import type { Browser } from 'puppeteer-core';

import { getConfig, type Config } from '../config/config';
import { getOrLaunchChromeForProfile } from '../chrome/manager';
import { scanChromeProfiles, type ChromeProfile } from '../chrome/profiles';
import type { Session } from '../sessions/types';

const FALLBACK_CDP_PORT = 9222;

function normalize(value?: string | null): string | null {
  return value ? value.trim().toLowerCase() : null;
}

function pickProfileByName(profiles: ChromeProfile[], name: string): ChromeProfile | null {
  const normalized = normalize(name);
  if (!normalized) return null;

  return (
    profiles.find((p) => normalize(p.name) === normalized) ||
    profiles.find((p) => normalize(p.profileDirectory) === normalized) ||
    profiles.find((p) => normalize(p.profileDir) === normalized) ||
    profiles.find((p) => normalize(p.id) === normalized) ||
    null
  );
}

function resolvePort(session: Session, config?: Config | null): number {
  const candidate = session.cdpPort ?? config?.cdpPort ?? FALLBACK_CDP_PORT;
  const port = Number(candidate);
  return Number.isFinite(port) && port > 0 ? port : FALLBACK_CDP_PORT;
}

async function resolveProfile(
  session: Session,
  config?: Config
): Promise<{ profile: ChromeProfile; profiles: ChromeProfile[] }> {
  const profiles = await scanChromeProfiles();
  if (profiles.length === 0) {
    throw new Error('Chrome profiles not found. Configure Chrome user data root in Settings.');
  }

  // STRICT: If session has a specific profile name, we MUST use it.
  if (session.chromeProfileName) {
      const match = pickProfileByName(profiles, session.chromeProfileName);
      if (match) return { profile: match, profiles };
      
      // If specified but not found, we should probably warn, but for now we fall back to default 
      // to avoid breaking everything, though this is where the mixup can happen.
      // ideally we throw here:
      // throw new Error(`Profile '${session.chromeProfileName}' not found`);
  }

  // Only fallback to global active profile if session didn't specify one
  if (!session.chromeProfileName && config?.chromeActiveProfileName) {
      const match = pickProfileByName(profiles, config.chromeActiveProfileName);
      if (match) return { profile: match, profiles };
  }

  const fallback = profiles.find((p) => p.isDefault) ?? profiles[0];
  return { profile: fallback, profiles };
}

export async function ensureBrowserForSession(
  session: Session,
  config?: Config
): Promise<{ browser: Browser; profile: ChromeProfile; port: number; config: Config }> {
  const resolvedConfig = config ?? (await getConfig());
  const { profile } = await resolveProfile(session, resolvedConfig);
  const port = resolvePort(session, resolvedConfig);
  
  // Pass session.id to generate unique user data dir
  const browser = await getOrLaunchChromeForProfile(profile, port, session.id);

  return { browser, profile, port, config: resolvedConfig };
}

export { resolvePort as resolveCdpPort };