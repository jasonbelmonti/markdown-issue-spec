import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  indexValidationErrors,
  openProjectionDatabase,
} from "../projection/index.ts";
import { rebuildProjectionFromCanonicalMarkdown } from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const FIXED_INDEXED_AT = "2026-04-11T08:15:00-05:00";

const STALE_ISSUE_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-9000
title: Old projection row
kind: task
status: accepted
created_at: 2026-04-09T09:00:00-05:00
---
## Objective

Leave behind stale projection state.
`;

const ISSUE_0100_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0100
title: Projection root
kind: task
status: completed
resolution: done
created_at: 2026-04-10T09:00:00-05:00
---
## Objective

Anchor the rebuilt projection.
`;

const ISSUE_0200_UNRESOLVED_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0200
title: Missing dependency target
kind: task
status: accepted
created_at: 2026-04-10T10:00:00-05:00
links:
  - rel: references
    target: ISSUE-0999
---
## Objective

Record the current graph validation error state.
`;

const ISSUE_0200_RESOLVED_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0200
title: Resolved dependency target
kind: task
status: accepted
created_at: 2026-04-10T10:00:00-05:00
links:
  - rel: depends_on
    target: ISSUE-0100
    required_before: completed
---
## Objective

Reuse the rebuilt projection without stale validation errors.
`;

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-rebuild-projection-"));
}

async function writeIssueFile(
  rootDirectory: string,
  fileName: string,
  source: string,
): Promise<void> {
  const issueDirectoryPath = join(rootDirectory, "vault", "issues");

  await mkdir(issueDirectoryPath, { recursive: true });
  await writeFile(join(issueDirectoryPath, fileName), source, "utf8");
}

async function deleteIssueFile(
  rootDirectory: string,
  fileName: string,
): Promise<void> {
  await rm(join(rootDirectory, "vault", "issues", fileName));
}

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

async function rebuildProjection(
  database: ProjectionDatabase,
  rootDirectory: string,
) {
  return rebuildProjectionFromCanonicalMarkdown({
    database,
    rootDirectory,
    indexedAt: FIXED_INDEXED_AT,
  });
}

function getIndexedIssueRows(database: ProjectionDatabase) {
  return database
    .query<
      {
        issue_id: string;
        file_path: string;
        title: string;
      },
      []
    >(
      `SELECT
         issue_id,
         file_path,
         title
       FROM issues
       ORDER BY issue_id`,
    )
    .all();
}

function getValidationErrorRows(database: ProjectionDatabase) {
  return database
    .query<
      {
        file_path: string;
        issue_id: string | null;
        code: string;
        related_issue_ids_json: string | null;
      },
      []
    >(
      `SELECT
         file_path,
         issue_id,
         code,
         related_issue_ids_json
       FROM validation_errors
       ORDER BY file_path, position`,
    )
    .all();
}

function expectCurrentUnresolvedReferenceError(
  database: ProjectionDatabase,
): void {
  expect(getValidationErrorRows(database)).toEqual([
    {
      file_path: "vault/issues/ISSUE-0200.md",
      issue_id: "ISSUE-0200",
      code: "graph.unresolved_reference",
      related_issue_ids_json: "[\"ISSUE-0999\"]",
    },
  ]);
}

test("rebuildProjectionFromCanonicalMarkdown recreates projection state from canonical Markdown", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(rootDirectory, "ISSUE-9000.md", STALE_ISSUE_SOURCE);

  try {
    await rebuildProjection(database, rootDirectory);

    indexValidationErrors(
      database,
      { file_path: "vault/issues/ISSUE-9999.md" },
      [
        {
          code: "startup.stale_projection",
          severity: "warning",
          message: "This row should disappear during rebuild.",
          file_path: "vault/issues/ISSUE-9999.md",
        },
      ],
    );

    await deleteIssueFile(rootDirectory, "ISSUE-9000.md");
    await writeIssueFile(rootDirectory, "ISSUE-0100.md", ISSUE_0100_SOURCE);
    await writeIssueFile(
      rootDirectory,
      "ISSUE-0200.md",
      ISSUE_0200_UNRESOLVED_SOURCE,
    );

    const result = await rebuildProjection(database, rootDirectory);

    expect(result.failures).toEqual([]);
    expect(result.issueEnvelopes.map((envelope) => envelope.issue.id)).toEqual([
      "ISSUE-0100",
      "ISSUE-0200",
    ]);
    expect(getIndexedIssueRows(database)).toEqual([
      {
        issue_id: "ISSUE-0100",
        file_path: "vault/issues/ISSUE-0100.md",
        title: "Projection root",
      },
      {
        issue_id: "ISSUE-0200",
        file_path: "vault/issues/ISSUE-0200.md",
        title: "Missing dependency target",
      },
    ]);
    expectCurrentUnresolvedReferenceError(database);
  } finally {
    database.close();
  }
});

test("rebuildProjectionFromCanonicalMarkdown refreshes current validation errors from canonical Markdown", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(rootDirectory, "ISSUE-0100.md", ISSUE_0100_SOURCE);
  await writeIssueFile(
    rootDirectory,
    "ISSUE-0200.md",
    ISSUE_0200_UNRESOLVED_SOURCE,
  );

  try {
    await rebuildProjection(database, rootDirectory);
    expectCurrentUnresolvedReferenceError(database);

    await writeIssueFile(
      rootDirectory,
      "ISSUE-0200.md",
      ISSUE_0200_RESOLVED_SOURCE,
    );

    const result = await rebuildProjection(database, rootDirectory);

    expect(result.failures).toEqual([]);
    expect(getIndexedIssueRows(database)).toEqual([
      {
        issue_id: "ISSUE-0100",
        file_path: "vault/issues/ISSUE-0100.md",
        title: "Projection root",
      },
      {
        issue_id: "ISSUE-0200",
        file_path: "vault/issues/ISSUE-0200.md",
        title: "Resolved dependency target",
      },
    ]);
    expect(getValidationErrorRows(database)).toEqual([]);
  } finally {
    database.close();
  }
});

test("rebuildProjectionFromCanonicalMarkdown preserves renamed file locators in projection state", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(rootDirectory, "schema-foundation.md", ISSUE_0100_SOURCE);

  try {
    const result = await rebuildProjection(database, rootDirectory);

    expect(result.failures).toEqual([]);
    expect(getIndexedIssueRows(database)).toEqual([
      {
        issue_id: "ISSUE-0100",
        file_path: "vault/issues/schema-foundation.md",
        title: "Projection root",
      },
    ]);
  } finally {
    database.close();
  }
});
