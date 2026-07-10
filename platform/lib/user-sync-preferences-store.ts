import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { UserSyncPreferences } from "@/lib/scheduling/syncPreferences";
import { DEFAULT_USER_SYNC_PREFERENCES } from "@/lib/scheduling/syncPreferences";

type PreferencesByUser = Record<string, UserSyncPreferences>;

const globalRef = globalThis as unknown as {
  __userSyncPreferences?: PreferencesByUser;
};

const DATA_DIR = join(process.cwd(), ".data");
const PREFS_FILE = join(DATA_DIR, "user-sync-preferences.json");

function normalizePreferences(value: unknown): UserSyncPreferences {
  const input = value as Partial<UserSyncPreferences> | null | undefined;
  return {
    autoSaveEnabled:
      typeof input?.autoSaveEnabled === "boolean"
        ? input.autoSaveEnabled
        : DEFAULT_USER_SYNC_PREFERENCES.autoSaveEnabled,
    autoRefreshEnabled:
      typeof input?.autoRefreshEnabled === "boolean"
        ? input.autoRefreshEnabled
        : DEFAULT_USER_SYNC_PREFERENCES.autoRefreshEnabled,
  };
}

function loadFromDisk(): PreferencesByUser {
  try {
    if (!existsSync(PREFS_FILE)) return {};
    const raw = readFileSync(PREFS_FILE, "utf8");
    const parsed = JSON.parse(raw) as PreferencesByUser;
    if (!parsed || typeof parsed !== "object") return {};
    const normalized: PreferencesByUser = {};
    for (const [networkId, prefs] of Object.entries(parsed)) {
      if (!networkId) continue;
      normalized[networkId] = normalizePreferences(prefs);
    }
    return normalized;
  } catch {
    return {};
  }
}

function getStore(): PreferencesByUser {
  if (!globalRef.__userSyncPreferences) {
    globalRef.__userSyncPreferences = loadFromDisk();
  }
  return globalRef.__userSyncPreferences;
}

function persistToDisk(store: PreferencesByUser) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(PREFS_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch {
    /* ignore on read-only filesystems (e.g. some serverless hosts) */
  }
}

export function hasUserSyncPreferencesOnServer(networkId: string): boolean {
  const store = getStore();
  return Object.prototype.hasOwnProperty.call(store, networkId);
}

export function readUserSyncPreferencesForUser(
  networkId: string,
): UserSyncPreferences | null {
  const store = getStore();
  if (!Object.prototype.hasOwnProperty.call(store, networkId)) {
    return null;
  }
  return normalizePreferences(store[networkId]);
}

export function writeUserSyncPreferencesForUser(
  networkId: string,
  preferences: UserSyncPreferences,
): UserSyncPreferences {
  const store = getStore();
  const normalized = normalizePreferences(preferences);
  store[networkId] = normalized;
  persistToDisk(store);
  return normalized;
}
