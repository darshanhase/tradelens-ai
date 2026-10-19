import type { Settings } from "@/types/settings";
import { defaultSettings } from "@/types/settings";
import * as db from "./db";

const SETTINGS_KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const saved = await db.get<Settings>(db.APP_STORE, SETTINGS_KEY);
  if (!saved) return defaultSettings();
  // Shallow-merge against defaults so newly introduced settings fields appear.
  return { ...defaultSettings(), ...saved, instruments: saved.instruments ?? defaultSettings().instruments };
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.put(db.APP_STORE, { key: SETTINGS_KEY, ...s } as Settings & { key: string });
}
