import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from './db.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('db', () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kratos-test-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createDb', () => {
    it('should create database with WAL mode', () => {
      const db = createDb(dbPath, path.join(tmpDir, 'empty-migrations'));
      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
      db.close();
    });

    it('should create migrations tracking table', () => {
      const db = createDb(dbPath, path.join(tmpDir, 'empty-migrations'));
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
      ).all();
      expect(tables).toHaveLength(1);
      db.close();
    });

    it('should apply migrations in order', () => {
      const migrationsDir = path.join(tmpDir, 'migrations');
      fs.mkdirSync(migrationsDir);
      fs.writeFileSync(
        path.join(migrationsDir, '001_create_foo.sql'),
        'CREATE TABLE foo (id INTEGER PRIMARY KEY);'
      );
      fs.writeFileSync(
        path.join(migrationsDir, '002_create_bar.sql'),
        'CREATE TABLE bar (id INTEGER PRIMARY KEY, foo_id INTEGER);'
      );

      const db = createDb(dbPath, migrationsDir);

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all().map(r => r.name);

      expect(tables).toContain('foo');
      expect(tables).toContain('bar');
      expect(tables).toContain('migrations');

      const applied = db.prepare('SELECT version, name FROM migrations ORDER BY version').all();
      expect(applied).toEqual([
        { version: 1, name: '001_create_foo.sql' },
        { version: 2, name: '002_create_bar.sql' },
      ]);

      db.close();
    });

    it('should not re-apply already applied migrations', () => {
      const migrationsDir = path.join(tmpDir, 'migrations');
      fs.mkdirSync(migrationsDir);
      fs.writeFileSync(
        path.join(migrationsDir, '001_create_foo.sql'),
        'CREATE TABLE foo (id INTEGER PRIMARY KEY);'
      );

      const db1 = createDb(dbPath, migrationsDir);
      db1.close();

      // Add a second migration
      fs.writeFileSync(
        path.join(migrationsDir, '002_create_bar.sql'),
        'CREATE TABLE bar (id INTEGER PRIMARY KEY);'
      );

      const db2 = createDb(dbPath, migrationsDir);
      const applied = db2.prepare('SELECT version FROM migrations ORDER BY version').all();
      expect(applied).toHaveLength(2);

      // foo should still exist (not dropped/recreated)
      const tables = db2.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='foo'"
      ).all();
      expect(tables).toHaveLength(1);

      db2.close();
    });

    it('should handle empty migrations directory', () => {
      const migrationsDir = path.join(tmpDir, 'empty-migrations');
      fs.mkdirSync(migrationsDir);

      const db = createDb(dbPath, migrationsDir);
      const applied = db.prepare('SELECT COUNT(*) as c FROM migrations').get();
      expect(applied.c).toBe(0);
      db.close();
    });

    it('should handle non-existent migrations directory', () => {
      const db = createDb(dbPath, path.join(tmpDir, 'does-not-exist'));
      const applied = db.prepare('SELECT COUNT(*) as c FROM migrations').get();
      expect(applied.c).toBe(0);
      db.close();
    });
  });
});
