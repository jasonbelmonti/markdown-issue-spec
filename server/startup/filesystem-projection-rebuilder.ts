import type { Database } from "bun:sqlite";
import { join } from "node:path";

import { openProjectionDatabase } from "../projection/index.ts";
import {
  rebuildProjectionFromCanonicalMarkdown,
  type RebuildProjectionFromCanonicalMarkdownResult,
} from "./rebuild-projection-from-canonical-markdown.ts";

export interface FilesystemProjectionRebuilderOptions {
  rootDirectory: string;
  databasePath?: string;
}

export type FilesystemProjectionRebuilder =
  () => Promise<RebuildProjectionFromCanonicalMarkdownResult>;

function resolveProjectionDatabasePath(
  rootDirectory: string,
  databasePath?: string,
): string {
  return databasePath ?? join(rootDirectory, ".mis", "index.sqlite");
}

export function createFilesystemProjectionRebuilder(
  options: FilesystemProjectionRebuilderOptions,
): FilesystemProjectionRebuilder {
  const databasePath = resolveProjectionDatabasePath(
    options.rootDirectory,
    options.databasePath,
  );
  let database: Database | undefined;

  return async () => {
    database ??= openProjectionDatabase(databasePath);

    return rebuildProjectionFromCanonicalMarkdown({
      database,
      rootDirectory: options.rootDirectory,
    });
  };
}
