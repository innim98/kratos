// App-wide key-value settings helpers (see phase-12).

export const DEFAULT_MAX_AGENTS_PER_FOLDER = 4;

// Read a setting as a positive integer, falling back when missing/invalid.
export function getIntSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  const n = parseInt(row?.value, 10);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

export function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}
