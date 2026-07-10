"use client";

export type UserSyncPreferences = {
  autoSaveEnabled: boolean;
  autoRefreshEnabled: boolean;
};

export const DEFAULT_USER_SYNC_PREFERENCES: UserSyncPreferences = {
  autoSaveEnabled: false,
  autoRefreshEnabled: false,
};

/** @deprecated Global keys — migrated into per-user storage on read. */
export const AUTO_SAVE_ENABLED_KEY = "wsom-scheduling-auto-save-enabled";
export const AUTO_REFRESH_ENABLED_KEY = "wsom-scheduling-auto-refresh-enabled";
export const LEGACY_CALENDAR_AUTOSAVE_KEY = "wsom-calendar-autosave-enabled";

const USER_PREFS_KEY_PREFIX = "wsom-user-sync-prefs";

export function userSyncPreferencesStorageKey(networkId: string): string {
  return `${USER_PREFS_KEY_PREFIX}:${networkId}`;
}

function parseBoolean(raw: string | null): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function readLegacyGlobalPreferences(): UserSyncPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    let autoSave = parseBoolean(localStorage.getItem(AUTO_SAVE_ENABLED_KEY));
    if (autoSave === null) {
      autoSave = parseBoolean(localStorage.getItem(LEGACY_CALENDAR_AUTOSAVE_KEY));
    }
    const autoRefresh = parseBoolean(localStorage.getItem(AUTO_REFRESH_ENABLED_KEY));
    if (autoSave === null && autoRefresh === null) return null;
    return {
      autoSaveEnabled: autoSave ?? DEFAULT_USER_SYNC_PREFERENCES.autoSaveEnabled,
      autoRefreshEnabled:
        autoRefresh ?? DEFAULT_USER_SYNC_PREFERENCES.autoRefreshEnabled,
    };
  } catch {
    return null;
  }
}

export function readUserSyncPreferences(
  networkId: string,
  defaults: UserSyncPreferences = DEFAULT_USER_SYNC_PREFERENCES,
): UserSyncPreferences {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(userSyncPreferencesStorageKey(networkId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserSyncPreferences>;
      return {
        autoSaveEnabled:
          typeof parsed.autoSaveEnabled === "boolean"
            ? parsed.autoSaveEnabled
            : defaults.autoSaveEnabled,
        autoRefreshEnabled:
          typeof parsed.autoRefreshEnabled === "boolean"
            ? parsed.autoRefreshEnabled
            : defaults.autoRefreshEnabled,
      };
    }

    const legacy = readLegacyGlobalPreferences();
    if (legacy) {
      writeUserSyncPreferences(networkId, legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

export function writeUserSyncPreferences(
  networkId: string,
  preferences: UserSyncPreferences,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      userSyncPreferencesStorageKey(networkId),
      JSON.stringify(preferences),
    );
  } catch {
    /* ignore */
  }
}

/** @deprecated Use readUserSyncPreferences(networkId) */
export function readSyncPreference(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    const parsed = parseBoolean(raw);
    if (parsed !== null) return parsed;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

/** @deprecated Use writeUserSyncPreferences(networkId, prefs) */
export function writeSyncPreference(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    /* ignore */
  }
}

/** @deprecated Use readUserSyncPreferences(networkId) */
export function readAutoSaveEnabled(defaultValue = false): boolean {
  return readSyncPreference(AUTO_SAVE_ENABLED_KEY, defaultValue);
}
