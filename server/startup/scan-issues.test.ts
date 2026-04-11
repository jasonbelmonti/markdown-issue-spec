import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  indexValidationErrors,
  openProjectionDatabase,
} from "../projection/index.ts";
import {
  rejectDuplicateParsedIssueIds,
  scanIssueFilesIntoProjection,
} from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const FIXED_INDEXED_AT = "2026-04-10T17:30:00-05:00";

const ISSUE_0100_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0100
title: Schema foundation
kind: task
status: completed
resolution: done
created_at: 2026-04-08T09:00:00-05:00
labels:
  - projection
---
## Objective

Bootstrap the projection schema.
`;

const ISSUE_0200_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0200
title: Startup scan indexing
kind: task
status: accepted
created_at: 2026-04-09T10:00:00-05:00
links:
  - rel: depends_on
    target: ISSUE-0100
    required_before: completed
---
## Objective

Populate SQLite from canonical Markdown.
`;

const ISSUE_0400_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0400
title: Wait on an unsatisfied dependency
kind: task
status: accepted
created_at: 2026-04-09T11:00:00-05:00
links:
  - rel: depends_on
    target: ISSUE-0500
    required_before: completed
---
## Objective

Stay blocked until ISSUE-0500 is done.
`;

const ISSUE_0500_SOURCE = `---
spec_version: mis/0.1
id: ISSUE-0500
title: In-flight dependency
kind: task
status: in_progress
created_at: 2026-04-09T12:00:00-05:00
---
## Objective

Finish the dependency.
`;

const INVALID_ISSUE_SOURCE = `---
spec_version mis/0.1
id: ISSUE-0999
title: Broken YAML
`;

function replaceIssueId(source: string, nextIssueId: string): string {
  return source.replaceAll("ISSUE-0100", nextIssueId);
}

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-startup-scan-"));
}

function createRevision(source: string): string {
  return createHash("sha256").update(source).digest("hex");
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

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function getIndexedIssueRows(database: ProjectionDatabase) {
  return database
    .query<
      {
        issue_id: string;
        file_path: string;
        revision: string;
        indexed_at: string;
        ready: number;
        is_blocked: number;
      },
      []
    >(
      `SELECT
         issue_id,
         file_path,
         revision,
         indexed_at,
         ready,
         is_blocked
       FROM issues
       ORDER BY issue_id`,
    )
    .all();
}

function getValidationErrorRows(database: ProjectionDatabase) {
  return database
    .query<{ file_path: string; code: string }, []>(
      `SELECT file_path, code
       FROM validation_errors
       ORDER BY file_path, position`,
    )
    .all();
}

test("scanIssueFilesIntoProjection indexes canonical issue files in deterministic order", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(rootDirectory, "ISSUE-0200.md", ISSUE_0200_SOURCE);
  await writeIssueFile(rootDirectory, "ISSUE-0100.md", ISSUE_0100_SOURCE);
  await writeIssueFile(rootDirectory, "ISSUE-0400.md", ISSUE_0400_SOURCE);
  await writeIssueFile(rootDirectory, "ISSUE-0500.md", ISSUE_0500_SOURCE);
  await writeFile(
    join(rootDirectory, "vault", "issues", "README.txt"),
    "ignore me",
    "utf8",
  );

  try {
    const result = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    expect(result.failures).toEqual([]);
    expect(result.issueEnvelopes.map((envelope) => envelope.issue.id)).toEqual([
      "ISSUE-0100",
      "ISSUE-0200",
      "ISSUE-0400",
      "ISSUE-0500",
    ]);

    expect(getIndexedIssueRows(database)).toEqual([
      {
        issue_id: "ISSUE-0100",
        file_path: "vault/issues/ISSUE-0100.md",
        revision: createRevision(ISSUE_0100_SOURCE),
        indexed_at: FIXED_INDEXED_AT,
        ready: 1,
        is_blocked: 0,
      },
      {
        issue_id: "ISSUE-0200",
        file_path: "vault/issues/ISSUE-0200.md",
        revision: createRevision(ISSUE_0200_SOURCE),
        indexed_at: FIXED_INDEXED_AT,
        ready: 1,
        is_blocked: 0,
      },
      {
        issue_id: "ISSUE-0400",
        file_path: "vault/issues/ISSUE-0400.md",
        revision: createRevision(ISSUE_0400_SOURCE),
        indexed_at: FIXED_INDEXED_AT,
        ready: 1,
        is_blocked: 0,
      },
      {
        issue_id: "ISSUE-0500",
        file_path: "vault/issues/ISSUE-0500.md",
        revision: createRevision(ISSUE_0500_SOURCE),
        indexed_at: FIXED_INDEXED_AT,
        ready: 1,
        is_blocked: 0,
      },
    ]);
  } finally {
    database.close();
  }
});

test("scanIssueFilesIntoProjection collects parse failures and continues indexing valid files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();
  const issue0300Source = replaceIssueId(ISSUE_0100_SOURCE, "ISSUE-0300");

  await writeIssueFile(rootDirectory, "ISSUE-0300.md", issue0300Source);
  await writeIssueFile(rootDirectory, "ISSUE-0999.md", INVALID_ISSUE_SOURCE);

  try {
    const result = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    expect(result.issueEnvelopes.map((envelope) => envelope.issue.id)).toEqual([
      "ISSUE-0300",
    ]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual({
      filePath: "vault/issues/ISSUE-0999.md",
      message: expect.stringContaining("Markdown issue document is missing YAML frontmatter."),
    });
    expect(getIndexedIssueRows(database)).toEqual([
      {
        issue_id: "ISSUE-0300",
        file_path: "vault/issues/ISSUE-0300.md",
        revision: createRevision(issue0300Source),
        indexed_at: FIXED_INDEXED_AT,
        ready: 1,
        is_blocked: 0,
      },
    ]);
  } finally {
    database.close();
  }
});

test("scanIssueFilesIntoProjection removes stale projection rows for files missing from vault/issues", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(rootDirectory, "ISSUE-0100.md", ISSUE_0100_SOURCE);
  await writeIssueFile(rootDirectory, "ISSUE-0200.md", ISSUE_0200_SOURCE);

  try {
    await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    await Bun.file(join(rootDirectory, "vault", "issues", "ISSUE-0200.md")).delete();

    indexValidationErrors(
      database,
      { file_path: "vault/issues/ISSUE-0200.md" },
      [
        {
          code: "startup.stale_projection",
          severity: "warning",
          message: "This row should be removed during reconcile.",
          file_path: "vault/issues/ISSUE-0200.md",
        },
      ],
    );

    const result = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    expect(result.failures).toEqual([]);
    expect(getIndexedIssueRows(database)).toEqual([
      {
        issue_id: "ISSUE-0100",
        file_path: "vault/issues/ISSUE-0100.md",
        revision: createRevision(ISSUE_0100_SOURCE),
        indexed_at: FIXED_INDEXED_AT,
        ready: 1,
        is_blocked: 0,
      },
    ]);
    expect(getValidationErrorRows(database)).toEqual([]);
  } finally {
    database.close();
  }
});

test("scanIssueFilesIntoProjection rejects files whose frontmatter id does not match the filename", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(
    rootDirectory,
    "ISSUE-0001.md",
    replaceIssueId(ISSUE_0100_SOURCE, "ISSUE-9999"),
  );

  try {
    const result = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    expect(result.issueEnvelopes).toEqual([]);
    expect(result.failures).toEqual([
      {
        filePath: "vault/issues/ISSUE-0001.md",
        message:
          'Issue file for "ISSUE-0001" contained mismatched frontmatter id "ISSUE-9999".',
      },
    ]);
    expect(getIndexedIssueRows(database)).toEqual([]);
  } finally {
    database.close();
  }
});

test("scanIssueFilesIntoProjection clears stale projection state when a file becomes unreadable", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const database = openMemoryProjectionDatabase();

  await writeIssueFile(rootDirectory, "ISSUE-0100.md", ISSUE_0100_SOURCE);

  try {
    await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    indexValidationErrors(
      database,
      { file_path: "vault/issues/ISSUE-0100.md" },
      [
        {
          code: "startup.stale_projection",
          severity: "warning",
          message: "This row should be removed when parsing fails.",
          file_path: "vault/issues/ISSUE-0100.md",
        },
      ],
    );
    await writeIssueFile(rootDirectory, "ISSUE-0100.md", INVALID_ISSUE_SOURCE);

    const result = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: FIXED_INDEXED_AT,
    });

    expect(result.issueEnvelopes).toEqual([]);
    expect(result.failures).toEqual([
      {
        filePath: "vault/issues/ISSUE-0100.md",
        message: expect.stringContaining(
          "Markdown issue document is missing YAML frontmatter.",
        ),
      },
    ]);
    expect(getIndexedIssueRows(database)).toEqual([]);
    expect(getValidationErrorRows(database)).toEqual([]);
  } finally {
    database.close();
  }
});

test("rejectDuplicateParsedIssueIds reports conflicting issue ids instead of overwriting later entries", () => {
  const duplicateIssueId = "ISSUE-0001";

  const result = rejectDuplicateParsedIssueIds([
    {
      issue: {
        spec_version: "mis/0.1",
        id: duplicateIssueId,
        title: "First copy",
        kind: "task",
        status: "accepted",
        created_at: "2026-04-10T12:00:00-05:00",
      },
      revision: "rev-1",
      source: {
        file_path: "vault/issues/a/ISSUE-0001.md",
        indexed_at: FIXED_INDEXED_AT,
      },
    },
    {
      issue: {
        spec_version: "mis/0.1",
        id: duplicateIssueId,
        title: "Second copy",
        kind: "task",
        status: "accepted",
        created_at: "2026-04-10T12:05:00-05:00",
      },
      revision: "rev-2",
      source: {
        file_path: "vault/issues/b/ISSUE-0001.md",
        indexed_at: FIXED_INDEXED_AT,
      },
    },
  ]);

  expect(result.acceptedParsedIssues).toEqual([]);
  expect(result.failures).toEqual([
    {
      filePath: "vault/issues/a/ISSUE-0001.md",
      message: `Discovered duplicate issue id "ISSUE-0001" in multiple files:
- vault/issues/a/ISSUE-0001.md
- vault/issues/b/ISSUE-0001.md`,
    },
    {
      filePath: "vault/issues/b/ISSUE-0001.md",
      message: `Discovered duplicate issue id "ISSUE-0001" in multiple files:
- vault/issues/a/ISSUE-0001.md
- vault/issues/b/ISSUE-0001.md`,
    },
  ]);
});
