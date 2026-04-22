import { expect, test } from "bun:test";
import { mkdtemp, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue, IssueEnvelope } from "../../core/types/index.ts";
import { indexIssueEnvelope, openProjectionDatabase } from "../../projection/index.ts";
import {
  FilesystemIssueStore,
  ProjectionIssuePathResolver,
} from "../../store/index.ts";
import { UnsafeIssueIdError } from "../../store/issue-file-path.ts";
import { ScanIssueFileIdMismatchError } from "../../startup/index.ts";
import { loadResolvedIssueFile } from "./load-resolved-issue-file.ts";

const INDEXED_AT = "2026-04-21T16:30:00-05:00";

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-0200",
  title: "Resolve existing issue file through projection",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-21T12:00:00-05:00",
};

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-resolved-loader-"));
}

function createEnvelope(issue: Issue, filePath: string): IssueEnvelope {
  return {
    issue,
    revision: `rev-${issue.id.toLowerCase()}`,
    source: {
      file_path: filePath,
      indexed_at: INDEXED_AT,
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

async function indexProjectedIssue(
  rootDirectory: string,
  issue: Issue,
  filePath: string,
): Promise<void> {
  const database = openProjectionDatabase(join(rootDirectory, ".mis", "index.sqlite"));

  try {
    indexIssueEnvelope(database, createEnvelope(issue, filePath));
  } finally {
    database.close();
  }
}

function createStore(rootDirectory: string): FilesystemIssueStore {
  return new FilesystemIssueStore({ rootDirectory });
}

function createResolver(rootDirectory: string): ProjectionIssuePathResolver {
  return new ProjectionIssuePathResolver({
    rootDirectory,
    databasePath: join(rootDirectory, ".mis", "index.sqlite"),
  });
}

test("loadResolvedIssueFile returns null when the projection has no locator for the issue", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  expect(
    await loadResolvedIssueFile(
      createStore(rootDirectory),
      createResolver(rootDirectory),
      EXISTING_ISSUE.id,
      INDEXED_AT,
    ),
  ).toBeNull();
});

test("loadResolvedIssueFile rejects unsafe issue ids before resolving the locator", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  await expect(
    loadResolvedIssueFile(
      createStore(rootDirectory),
      createResolver(rootDirectory),
      "../ISSUE-0200",
      INDEXED_AT,
    ),
  ).rejects.toBeInstanceOf(UnsafeIssueIdError);
});

test("loadResolvedIssueFile returns the parsed issue, locator, and rollback snapshot for a renamed file", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = createStore(rootDirectory);
  await store.writeIssue(EXISTING_ISSUE);

  const canonicalFilePath = store.getIssueFilePath(EXISTING_ISSUE.id);
  const renamedStartupRelativeFilePath = "vault/issues/schema-foundation.md";
  const renamedAbsoluteFilePath = join(
    rootDirectory,
    "vault",
    "issues",
    "schema-foundation.md",
  );
  await rename(canonicalFilePath, renamedAbsoluteFilePath);
  await indexProjectedIssue(
    rootDirectory,
    EXISTING_ISSUE,
    renamedStartupRelativeFilePath,
  );

  const loadedIssue = await loadResolvedIssueFile(
    store,
    createResolver(rootDirectory),
    EXISTING_ISSUE.id,
    INDEXED_AT,
  );

  expect(loadedIssue).not.toBeNull();
  expect(loadedIssue).toMatchObject({
    parsedIssue: {
      issue: EXISTING_ISSUE,
      source: {
        file_path: renamedStartupRelativeFilePath,
        indexed_at: INDEXED_AT,
      },
    },
    issueLocator: {
      startupRelativeFilePath: renamedStartupRelativeFilePath,
      absoluteFilePath: renamedAbsoluteFilePath,
    },
    canonicalSnapshot: {
      filePath: renamedAbsoluteFilePath,
      originalSource: await readFile(renamedAbsoluteFilePath, "utf8"),
    },
  });
});

test("loadResolvedIssueFile preserves id mismatch failures from targeted parsing", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = createStore(rootDirectory);
  const mismatchedIssue: Issue = {
    ...EXISTING_ISSUE,
    id: "ISSUE-0999",
  };
  const projectedIssueId = EXISTING_ISSUE.id;
  const renamedStartupRelativeFilePath = "vault/issues/schema-foundation.md";
  const renamedAbsoluteFilePath = join(
    rootDirectory,
    "vault",
    "issues",
    "schema-foundation.md",
  );

  await store.writeIssue(mismatchedIssue);
  await rename(store.getIssueFilePath(mismatchedIssue.id), renamedAbsoluteFilePath);
  await indexProjectedIssue(
    rootDirectory,
    {
      ...mismatchedIssue,
      id: projectedIssueId,
    },
    renamedStartupRelativeFilePath,
  );

  await expect(
    loadResolvedIssueFile(
      store,
      createResolver(rootDirectory),
      projectedIssueId,
      INDEXED_AT,
    ),
  ).rejects.toEqual(
    expect.objectContaining<Partial<ScanIssueFileIdMismatchError>>({
      name: "ScanIssueFileIdMismatchError",
      expectedIssueId: projectedIssueId,
      actualIssueId: mismatchedIssue.id,
      filePath: renamedAbsoluteFilePath,
    }),
  );
});
