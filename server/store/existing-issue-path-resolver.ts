import type { Database } from "bun:sqlite";
import { isAbsolute, join, win32 } from "node:path";

import { openProjectionDatabase, readIssueLocator } from "../projection/index.ts";

export interface ResolvedIssueLocator {
  startupRelativeFilePath: string;
  absoluteFilePath: string;
}

export interface ExistingIssuePathResolver {
  resolveExistingIssuePath(issueId: string): Promise<ResolvedIssueLocator | null>;
}

export interface ProjectionIssuePathResolverOptions {
  rootDirectory: string;
  databasePath: string;
}

export class UnsafeIssueLocatorError extends Error {
  readonly startupRelativeFilePath: string;

  constructor(startupRelativeFilePath: string, message: string) {
    super(message);
    this.name = "UnsafeIssueLocatorError";
    this.startupRelativeFilePath = startupRelativeFilePath;
  }
}

function toSafeStartupRelativePathSegments(
  startupRelativeFilePath: string,
): string[] {
  if (startupRelativeFilePath.length === 0) {
    throw new UnsafeIssueLocatorError(
      startupRelativeFilePath,
      "Projected issue locator must be a non-empty relative file path.",
    );
  }

  if (
    isAbsolute(startupRelativeFilePath) ||
    win32.isAbsolute(startupRelativeFilePath)
  ) {
    throw new UnsafeIssueLocatorError(
      startupRelativeFilePath,
      `Projected issue locator "${startupRelativeFilePath}" must be relative to the repository root.`,
    );
  }

  const segments = startupRelativeFilePath.replaceAll("\\", "/").split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new UnsafeIssueLocatorError(
      startupRelativeFilePath,
      `Projected issue locator "${startupRelativeFilePath}" contains unsafe path segments.`,
    );
  }

  return segments;
}

export function resolveIssueLocatorAbsoluteFilePath(
  rootDirectory: string,
  startupRelativeFilePath: string,
): string {
  return join(
    rootDirectory,
    ...toSafeStartupRelativePathSegments(startupRelativeFilePath),
  );
}

export class ProjectionIssuePathResolver implements ExistingIssuePathResolver {
  readonly rootDirectory: string;
  readonly databasePath: string;
  #database: Database | undefined;

  constructor(options: ProjectionIssuePathResolverOptions) {
    this.rootDirectory = options.rootDirectory;
    this.databasePath = options.databasePath;
  }

  async resolveExistingIssuePath(
    issueId: string,
  ): Promise<ResolvedIssueLocator | null> {
    this.#database ??= openProjectionDatabase(this.databasePath);

    const projectedLocator = readIssueLocator(this.#database, issueId);

    if (projectedLocator == null) {
      return null;
    }

    return {
      startupRelativeFilePath: projectedLocator.filePath,
      absoluteFilePath: resolveIssueLocatorAbsoluteFilePath(
        this.rootDirectory,
        projectedLocator.filePath,
      ),
    };
  }
}
