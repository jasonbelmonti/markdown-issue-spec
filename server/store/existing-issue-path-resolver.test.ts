import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue, IssueEnvelope } from "../core/types/index.ts";
import { indexIssueEnvelope, openProjectionDatabase } from "../projection/index.ts";
import {
  ProjectionIssuePathResolver,
  resolveIssueLocatorAbsoluteFilePath,
} from "./index.ts";

function createEnvelope(filePath: string): IssueEnvelope {
  const issue: Issue = {
    spec_version: "mis/0.1",
    id: "ISSUE-0200",
    title: "Resolve existing issue locator from projection",
    kind: "task",
    status: "proposed",
    created_at: "2026-04-21T12:00:00-05:00",
  };

  return {
    issue,
    revision: "rev-issue-0200",
    source: {
      file_path: filePath,
      indexed_at: "2026-04-21T12:05:00-05:00",
    },
    derived: {
      children_ids: [],
      blocks_ids: [],
      blocked_by_ids: [],
      duplicates_ids: [],
      ready: true,
      is_blocked: false,
    },
  };
}

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-resolver-"));
}

test("resolveIssueLocatorAbsoluteFilePath converts a startup-relative locator into an absolute filesystem path", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  expect(
    resolveIssueLocatorAbsoluteFilePath(
      rootDirectory,
      "vault/issues/schema-foundation.md",
    ),
  ).toBe(join(rootDirectory, "vault", "issues", "schema-foundation.md"));
});

test("resolveIssueLocatorAbsoluteFilePath rejects unsafe projected locators", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  expect(() =>
    resolveIssueLocatorAbsoluteFilePath(rootDirectory, "../escape.md"),
  ).toThrow(
    'Projected issue locator "../escape.md" contains unsafe path segments.',
  );
  expect(() =>
    resolveIssueLocatorAbsoluteFilePath(rootDirectory, "/tmp/escape.md"),
  ).toThrow(
    'Projected issue locator "/tmp/escape.md" must be relative to the repository root.',
  );
});

test("ProjectionIssuePathResolver returns null when projection has no locator for the issue id", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const databasePath = join(rootDirectory, ".mis", "index.sqlite");
  const resolver = new ProjectionIssuePathResolver({
    rootDirectory,
    databasePath,
  });

  expect(await resolver.resolveExistingIssuePath("ISSUE-4040")).toBeNull();
});

test("ProjectionIssuePathResolver resolves startup-relative locators into absolute filesystem paths", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const databasePath = join(rootDirectory, ".mis", "index.sqlite");
  const database = openProjectionDatabase(databasePath);

  try {
    indexIssueEnvelope(
      database,
      createEnvelope("vault/issues/schema-foundation.md"),
    );
  } finally {
    database.close();
  }

  const resolver = new ProjectionIssuePathResolver({
    rootDirectory,
    databasePath,
  });

  expect(await resolver.resolveExistingIssuePath("ISSUE-0200")).toEqual({
    startupRelativeFilePath: "vault/issues/schema-foundation.md",
    absoluteFilePath: join(
      rootDirectory,
      "vault",
      "issues",
      "schema-foundation.md",
    ),
  });
});
