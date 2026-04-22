import { expect, test } from "bun:test";

import type { Issue, IssueEnvelope } from "../core/types/index.ts";
import {
  indexIssueEnvelope,
  openProjectionDatabase,
  readIssueLocator,
} from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function createEnvelope(filePath: string): IssueEnvelope {
  const issue: Issue = {
    spec_version: "mis/0.1",
    id: "ISSUE-0200",
    title: "Read projection locator by canonical issue id",
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

test("readIssueLocator returns null when the projection does not contain the issue", () => {
  const database = openMemoryProjectionDatabase();

  try {
    expect(readIssueLocator(database, "ISSUE-4040")).toBeNull();
  } finally {
    database.close();
  }
});

test("readIssueLocator returns the stored startup-relative file path", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexIssueEnvelope(
      database,
      createEnvelope("vault/issues/schema-foundation.md"),
    );

    expect(readIssueLocator(database, "ISSUE-0200")).toEqual({
      filePath: "vault/issues/schema-foundation.md",
    });
  } finally {
    database.close();
  }
});
