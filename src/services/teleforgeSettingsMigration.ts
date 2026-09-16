// TeleForge 1.0 — Settings Migration, Backup/Restore & Data Reset Engine
// Provides schema-versioned persistence, non-sensitive JSON backup & export,
// safe schema migration, and a separate factory reset for customization.

import { TeleForgeTheme, getSavedCustomThemes, saveCustomThemes } from '../theme/teleforgeTheme';
import {
  TeleForgePowerToolsSettings,
  getPowerToolsSettings,
  savePowerToolsSettings,
  DEFAULT_POWER_TOOLS_SETTINGS,
  getAllChatCustomizations,
} from './teleforgePowerTools';
import { getFavorites, getRecentlyUsed } from './teleforgeCommandCenter';

export const CURRENT_TELEFORGE_SCHEMA_VERSION = 1;
export const TELEFORGE_CLIENT_VERSION = '1.0.0';

export interface TeleForgeExportPayload {
  meta: {
    client: 'TeleForge';
    version: string;
    schemaVersion: number;
    exportedAt: string;
  };
  customThemes: TeleForgeTheme[];
  activeThemeId?: string;
  powerToolsSettings: TeleForgePowerToolsSettings;
  chatCustomizations: Record<string, any>;
  commandCenterFavorites: string[];
}

/**
 * Automatically run on application boot.
 * Checks stored schema version and migrates preferences safely without data loss.
 */
export function runTeleForgeSettingsMigration(): { migrated: boolean; version: number } {
  if (typeof window === 'undefined') return { migrated: false, version: CURRENT_TELEFORGE_SCHEMA_VERSION };

  try {
    const rawVersion = localStorage.getItem('teleforge_schema_version');
    const currentVersion = rawVersion ? parseInt(rawVersion, 10) : 0;

    if (currentVersion < 1) {
      // Schema 0 -> Schema 1 migration:
      // 1. Ensure custom themes array is sanitized
      const rawThemes = localStorage.getItem('teleforge_custom_themes');
      if (rawThemes) {
        try {
          const parsed = JSON.parse(rawThemes);
          if (Array.isArray(parsed)) {
            saveCustomThemes(parsed);
          }
        } catch (e) {}
      }

      // 2. Ensure power tools settings has version field
      const ptSettings = getPowerToolsSettings();
      savePowerToolsSettings(ptSettings);

      // 3. Set current schema version
      localStorage.setItem('teleforge_schema_version', String(CURRENT_TELEFORGE_SCHEMA_VERSION));
      return { migrated: true, version: CURRENT_TELEFORGE_SCHEMA_VERSION };
    }

    return { migrated: false, version: currentVersion };
  } catch (err) {
    console.warn('[TeleForge Migration] Non-fatal migration check error:', err);
    return { migrated: false, version: CURRENT_TELEFORGE_SCHEMA_VERSION };
  }
}

/**
 * Exports ONLY non-sensitive TeleForge customization preferences to a clean JSON file.
 * Explicitly NEVER exports Telegram authentication tokens, session secrets, or passwords.
 */
export function exportTeleForgeSettings(): void {
  if (typeof window === 'undefined') return;

  try {
    const customThemes = getSavedCustomThemes();
    const powerToolsSettings = getPowerToolsSettings();
    const chatCustomizations = getAllChatCustomizations();
    const commandCenterFavorites = getFavorites();

    let activeThemeId: string | undefined = undefined;
    try {
      const activeRaw = localStorage.getItem('teleforge_theme');
      if (activeRaw) {
        const parsed = JSON.parse(activeRaw);
        activeThemeId = parsed?.id;
      }
    } catch (e) {}

    const payload: TeleForgeExportPayload = {
      meta: {
        client: 'TeleForge',
        version: TELEFORGE_CLIENT_VERSION,
        schemaVersion: CURRENT_TELEFORGE_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
      },
      customThemes,
      activeThemeId,
      powerToolsSettings,
      chatCustomizations,
      commandCenterFavorites,
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teleforge-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[TeleForge Export] Failed to export settings:', err);
    throw new Error('Could not export TeleForge settings. Please try again.');
  }
}

/**
 * Validates and restores TeleForge customization settings from an imported JSON string.
 */
export function importTeleForgeSettings(jsonString: string): { success: boolean; error?: string } {
  if (typeof window === 'undefined') return { success: false, error: 'Browser environment required' };

  try {
    const data = JSON.parse(jsonString);

    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid file content. Must be a valid TeleForge settings JSON.' };
    }

    if (data.meta?.client !== 'TeleForge') {
      return { success: false, error: 'Incompatible file: Not a recognized TeleForge settings export.' };
    }

    // 1. Restore Custom Themes
    if (Array.isArray(data.customThemes)) {
      saveCustomThemes(data.customThemes);
    }

    // 2. Restore Power Tools Settings
    if (data.powerToolsSettings && typeof data.powerToolsSettings === 'object') {
      savePowerToolsSettings({
        ...DEFAULT_POWER_TOOLS_SETTINGS,
        ...data.powerToolsSettings,
      });
    }

    // 3. Restore Chat Customizations
    if (data.chatCustomizations && typeof data.chatCustomizations === 'object') {
      localStorage.setItem('teleforge_chat_customizations', JSON.stringify(data.chatCustomizations));
    }

    // 4. Restore Command Center Favorites
    if (Array.isArray(data.commandCenterFavorites)) {
      localStorage.setItem('teleforge_command_center_favorites', JSON.stringify(data.commandCenterFavorites));
    }

    // Update schema version
    localStorage.setItem('teleforge_schema_version', String(CURRENT_TELEFORGE_SCHEMA_VERSION));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to parse settings JSON.' };
  }
}

/**
 * Factory Reset for TeleForge-specific customization.
 * Clears local themes, custom bubble styling, gestures, and favorites.
 * IMPORTANT: NEVER touches Telegram authentication session, cloud messages, or contacts.
 */
export function resetTeleForgeSettings(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem('teleforge_custom_themes');
    localStorage.removeItem('teleforge_theme');
    localStorage.removeItem('teleforge_power_tools_settings');
    localStorage.removeItem('teleforge_chat_customizations');
    localStorage.removeItem('teleforge_command_center_favorites');
    localStorage.removeItem('teleforge_command_center_recents');
    localStorage.setItem('teleforge_schema_version', String(CURRENT_TELEFORGE_SCHEMA_VERSION));
  } catch (err) {
    console.error('[TeleForge Reset] Error resetting settings:', err);
  }
}
