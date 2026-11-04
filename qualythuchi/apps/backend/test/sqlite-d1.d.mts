import type { DatabaseSync } from 'node:sqlite';

export function sqliteD1(): {
  db: D1Database;
  sql: DatabaseSync;
  primaryReads(): number;
  close(): void;
};
