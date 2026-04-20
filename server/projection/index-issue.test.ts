import { expect, test } from "bun:test";

import type { IssueEnvelope } from "../core/types/index.ts";
import { indexIssueEnvelope, openProjectionDatabase } from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const BASE_ENVELOPE: IssueEnvelope = {
  issue: {
    spec_version: "mis/0.1",
    id: "ISSUE-0300",
    title: "Index a canonical issue envelope",
    kind: "task",
    status: "in_progress",
    created_at: "2026-04-10T08:00:00-05:00",
    updated_at: "2026-04-10T09:15:00-05:00",
    summary: "Projection rows should match the envelope shape.",
    body: `## Objective

Index one issue into SQLite.
`,
    priority: "high",
    labels: ["projection", "indexing"],
    assignees: ["jason", "agent"],
    links: [
      {
        rel: "depends_on",
        target: {
          id: "ISSUE-0001",
          title: "Schema slice",
        },
        note: "Wait for schema bootstrap.",
        required_before: "completed",
        extensions: {
          "acme/dependency": "schema",
        },
      },
      {
        rel: "references",
        target: {
          id: "ISSUE-0002",
          href: "https://example.com/spec",
          path: "docs/spec.md",
        },
      },
    ],
    extensions: {
      "acme/source": "test",
    },
  },
  derived: {
    children_ids: ["ISSUE-0301"],
    blocks_ids: ["ISSUE-0400"],
    blocked_by_ids: ["ISSUE-0001"],
    duplicates_ids: [],
    ready: false,
    is_blocked: true,
  },
  revision: "rev-1",
  source: {
    file_path: "vault/issues/ISSUE-0300.md",
    indexed_at: "2026-04-10T09:30:00-05:00",
  },
};

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function getIssueRow(database: ProjectionDatabase) {
  return database
    .query<
      {
        issue_id: string;
        title: string;
        status: string;
        resolution: string | null;
        summary: string | null;
        body: string | null;
        priority: string | null;
        effective_updated_at_utc_second: string;
        effective_updated_at_fractional: string;
        revision: string;
        file_path: string;
        indexed_at: string;
        has_labels: number;
        has_assignees: number;
        has_links: number;
        ready: number;
        is_blocked: number;
        extensions_json: string | null;
      },
      []
    >(
      `SELECT
         issue_id,
         title,
         status,
         resolution,
         summary,
         body,
         priority,
         effective_updated_at_utc_second,
         effective_updated_at_fractional,
         revision,
         file_path,
         indexed_at,
         has_labels,
         has_assignees,
         has_links,
         ready,
         is_blocked,
         extensions_json
       FROM issues`,
    )
    .get();
}

function getLabelRows(database: ProjectionDatabase) {
  return database
    .query<{ position: number; label: string }, []>(
      `SELECT position, label
       FROM issue_labels
       ORDER BY position`,
    )
    .all();
}

function getAssigneeRows(database: ProjectionDatabase) {
  return database
    .query<{ position: number; assignee: string }, []>(
      `SELECT position, assignee
       FROM issue_assignees
       ORDER BY position`,
    )
    .all();
}

function getLinkRows(database: ProjectionDatabase) {
  return database
    .query<
      {
        position: number;
        rel: string;
        target_issue_id: string;
        target_href: string | null;
        target_path: string | null;
        target_title: string | null;
        note: string | null;
        required_before: string | null;
        extensions_json: string | null;
      },
      []
    >(
      `SELECT
         position,
         rel,
         target_issue_id,
         target_href,
         target_path,
         target_title,
         note,
         required_before,
         extensions_json
       FROM issue_links
       ORDER BY position`,
    )
    .all();
}

test("indexIssueEnvelope writes canonical issue, label, assignee, and link rows", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexIssueEnvelope(database, BASE_ENVELOPE);

    expect(getIssueRow(database)).toEqual({
      issue_id: "ISSUE-0300",
      title: "Index a canonical issue envelope",
      status: "in_progress",
      resolution: null,
      summary: "Projection rows should match the envelope shape.",
      body: `## Objective

Index one issue into SQLite.
`,
      priority: "high",
      effective_updated_at_utc_second: "2026-04-10T14:15:00Z",
      effective_updated_at_fractional: "",
      revision: "rev-1",
      file_path: "vault/issues/ISSUE-0300.md",
      indexed_at: "2026-04-10T09:30:00-05:00",
      has_labels: 1,
      has_assignees: 1,
      has_links: 1,
      ready: 0,
      is_blocked: 1,
      extensions_json: "{\"acme/source\":\"test\"}",
    });

    expect(getLabelRows(database)).toEqual([
      { position: 0, label: "projection" },
      { position: 1, label: "indexing" },
    ]);

    expect(getAssigneeRows(database)).toEqual([
      { position: 0, assignee: "jason" },
      { position: 1, assignee: "agent" },
    ]);

    expect(getLinkRows(database)).toEqual([
      {
        position: 0,
        rel: "depends_on",
        target_issue_id: "ISSUE-0001",
        target_href: null,
        target_path: null,
        target_title: "Schema slice",
        note: "Wait for schema bootstrap.",
        required_before: "completed",
        extensions_json: "{\"acme/dependency\":\"schema\"}",
      },
      {
        position: 1,
        rel: "references",
        target_issue_id: "ISSUE-0002",
        target_href: "https://example.com/spec",
        target_path: "docs/spec.md",
        target_title: null,
        note: null,
        required_before: null,
        extensions_json: null,
      },
    ]);
  } finally {
    database.close();
  }
});

test("indexIssueEnvelope replaces stale normalized rows when the same issue is re-indexed", () => {
  const database = openMemoryProjectionDatabase();
  const updatedEnvelope: IssueEnvelope = {
    ...BASE_ENVELOPE,
    issue: {
      ...BASE_ENVELOPE.issue,
      title: "Re-index the canonical issue envelope",
      status: "completed",
      resolution: "done",
      summary: undefined,
      priority: undefined,
      labels: ["projection"],
      assignees: undefined,
      links: [
        {
          rel: "related_to",
          target: { id: "ISSUE-0999", title: "Follow-up" },
          note: "Supersedes previous dependency links.",
        },
      ],
      extensions: {
        "acme/source": "updated",
      },
    },
    derived: {
      ...BASE_ENVELOPE.derived,
      ready: true,
      is_blocked: false,
    },
    revision: "rev-2",
    source: {
      ...BASE_ENVELOPE.source,
      indexed_at: "2026-04-10T10:00:00-05:00",
    },
  };

  try {
    indexIssueEnvelope(database, BASE_ENVELOPE);
    indexIssueEnvelope(database, updatedEnvelope);

    expect(getIssueRow(database)).toEqual({
      issue_id: "ISSUE-0300",
      title: "Re-index the canonical issue envelope",
      status: "completed",
      resolution: "done",
      summary: null,
      body: `## Objective

Index one issue into SQLite.
`,
      priority: null,
      effective_updated_at_utc_second: "2026-04-10T14:15:00Z",
      effective_updated_at_fractional: "",
      revision: "rev-2",
      file_path: "vault/issues/ISSUE-0300.md",
      indexed_at: "2026-04-10T10:00:00-05:00",
      has_labels: 1,
      has_assignees: 0,
      has_links: 1,
      ready: 1,
      is_blocked: 0,
      extensions_json: "{\"acme/source\":\"updated\"}",
    });

    expect(getLabelRows(database)).toEqual([{ position: 0, label: "projection" }]);
    expect(getAssigneeRows(database)).toEqual([]);
    expect(getLinkRows(database)).toEqual([
      {
        position: 0,
        rel: "related_to",
        target_issue_id: "ISSUE-0999",
        target_href: null,
        target_path: null,
        target_title: "Follow-up",
        note: "Supersedes previous dependency links.",
        required_before: null,
        extensions_json: null,
      },
    ]);
  } finally {
    database.close();
  }
});
