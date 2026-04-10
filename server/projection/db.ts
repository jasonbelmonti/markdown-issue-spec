import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { applyProjectionSchema } from "./schema.ts";

export interface OpenProjectionDatabaseOptions {
  applySchema?: boolean;
}

function ensureProjectionDirectory(databasePath: string): void {
  if (databasePath === ":memory:") {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
}

function configureProjectionDatabase(database: Database, databasePath: string): void {
  database.exec("PRAGMA foreign_keys = ON");

  if (databasePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
  }
}

export function openProjectionDatabase(
  databasePath: string,
  options: OpenProjectionDatabaseOptions = {},
): Database {
  ensureProjectionDirectory(databasePath);

  const database = new Database(databasePath, { create: true });

  configureProjectionDatabase(database, databasePath);

  if (options.applySchema ?? true) {
    applyProjectionSchema(database);
  }

  return database;
}
