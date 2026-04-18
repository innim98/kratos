import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function createDb(dbPath, migrationsDir) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  runMigrations(db, migrationsDir);

  return db;
}

function runMigrations(db, migrationsDir) {
  if (!migrationsDir || !fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) return;

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map(r => r.name)
  );

  const insertMigration = db.prepare(
    'INSERT INTO migrations (version, name) VALUES (?, ?)'
  );

  for (const file of files) {
    if (applied.has(file)) continue;

    const version = parseInt(file.split('_')[0], 10);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    const migrate = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(version, file);
    });

    migrate();
  }
}
