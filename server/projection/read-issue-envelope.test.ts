import { expect, test } from "bun:test";

import type {
  DerivedIssueFields,
  Issue,
  IssueEnvelope,
  IssueLink,
} from "../core/types/index.ts";
import {
  indexIssueEnvelope,
  openProjectionDatabase,
  readIssueEnvelope,
} from "./index.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

interface IssueInput {
  id: string;
  title: string;
  status?: Issue["status"];
  resolution?: Issue["resolution"];
  updatedAt?: string;
  summary?: string;
  body?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  links?: IssueLink[];
  extensions?: Issue["extensions"];
}

interface EnvelopeOverrides {
  derived?: Partial<DerivedIssueFields>;
  revision?: string;
  indexedAt?: string;
}

function openMemoryProjectionDatabase(): ProjectionDatabase {
  return openProjectionDatabase(":memory:");
}

function createIssue(input: IssueInput): Issue {
  const status = input.status ?? "proposed";
  const issueBase = {
    spec_version: "mis/0.1" as const,
    id: input.id,
    title: input.title,
    kind: "task",
    created_at: "2026-04-19T09:00:00-05:00",
    ...(input.updatedAt === undefined
      ? {}
      : { updated_at: input.updatedAt }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.labels === undefined ? {} : { labels: input.labels }),
    ...(input.assignees === undefined ? {} : { assignees: input.assignees }),
    ...(input.links === undefined ? {} : { links: input.links }),
    ...(input.extensions === undefined ? {} : { extensions: input.extensions }),
  };

  if (status === "completed") {
    if (input.resolution !== "done") {
      throw new Error(`Issue ${input.id} requires a resolution.`);
    }

    return {
      ...issueBase,
      status: "completed",
      resolution: "done",
    };
  }

  if (status === "canceled") {
    if (input.resolution == null || input.resolution === "done") {
      throw new Error(`Issue ${input.id} requires a canceled resolution.`);
    }

    return {
      ...issueBase,
      status: "canceled",
      resolution: input.resolution,
    };
  }

  return {
    ...issueBase,
    status,
  };
}

function createEnvelope(
  issue: Issue,
  overrides: EnvelopeOverrides = {},
): IssueEnvelope {
  return {
    issue,
    derived: {
      children_ids: [],
      blocks_ids: [],
      blocked_by_ids: [],
      duplicates_ids: [],
      ready: true,
      is_blocked: false,
      ...overrides.derived,
    },
    revision: overrides.revision ?? `rev-${issue.id.toLowerCase()}`,
    source: {
      file_path: `vault/issues/${issue.id}.md`,
      indexed_at: overrides.indexedAt ?? "2026-04-19T09:30:00-05:00",
    },
  };
}

test("readIssueEnvelope returns null when the projection does not contain the issue", () => {
  const database = openMemoryProjectionDatabase();

  try {
    expect(readIssueEnvelope(database, "ISSUE-4040")).toBeNull();
  } finally {
    database.close();
  }
});

test("readIssueEnvelope hydrates canonical fields and recomputes derived fields", () => {
  const database = openMemoryProjectionDatabase();
  const mainEnvelope = createEnvelope(
    createIssue({
      id: "ISSUE-0500",
      title: "Hydrate one issue envelope from projection rows",
      status: "in_progress",
      updatedAt: "2026-04-19T09:15:00-05:00",
      summary: "Projection reads should reconstruct derived fields.",
      body: `## Objective

Read one issue from SQLite.
`,
      priority: "high",
      labels: ["projection", "read-model"],
      assignees: ["jason", "agent"],
      links: [
        {
          rel: "depends_on",
          target: { id: "ISSUE-2000", title: "Open dependency" },
          note: "Still open.",
          required_before: "completed",
        },
        {
          rel: "depends_on",
          target: { id: "ISSUE-2000", title: "Open dependency duplicate" },
          required_before: "completed",
        },
        {
          rel: "depends_on",
          target: { id: "ISSUE-9999", title: "Missing dependency" },
          required_before: "completed",
        },
        {
          rel: "depends_on",
          target: { id: "ISSUE-1000", title: "Completed dependency" },
          required_before: "completed",
        },
        {
          rel: "related_to",
          target: {
            id: "ISSUE-9000",
            href: "https://example.com/spec",
            path: "docs/spec.md",
            title: "Spec reference",
          },
          note: "Extra context.",
          extensions: {
            "acme/link": "context",
          },
        },
      ],
      extensions: {
        "acme/source": "read-test",
      },
    }),
    {
      derived: {
        ready: true,
        is_blocked: false,
      },
      revision: "rev-main",
      indexedAt: "2026-04-19T10:30:00-05:00",
    },
  );

  const envelopesToIndex = [
    mainEnvelope,
    createEnvelope(
      createIssue({
        id: "ISSUE-2000",
        title: "Open dependency",
        status: "accepted",
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-1000",
        title: "Completed dependency",
        status: "completed",
        resolution: "done",
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-6002",
        title: "Second child",
        links: [{ rel: "parent", target: { id: "ISSUE-0500" } }],
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-6001",
        title: "First child",
        links: [
          { rel: "parent", target: { id: "ISSUE-0500" } },
          { rel: "parent", target: { id: "ISSUE-0500" } },
        ],
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-7002",
        title: "Second blocked issue",
        status: "in_progress",
        links: [
          {
            rel: "depends_on",
            target: { id: "ISSUE-0500" },
            required_before: "completed",
          },
        ],
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-7001",
        title: "First blocked issue",
        status: "in_progress",
        links: [
          {
            rel: "depends_on",
            target: { id: "ISSUE-0500" },
            required_before: "completed",
          },
          {
            rel: "depends_on",
            target: { id: "ISSUE-0500" },
            required_before: "completed",
          },
        ],
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-8002",
        title: "Second duplicate",
        links: [{ rel: "duplicate_of", target: { id: "ISSUE-0500" } }],
      }),
    ),
    createEnvelope(
      createIssue({
        id: "ISSUE-8001",
        title: "First duplicate",
        links: [
          { rel: "duplicate_of", target: { id: "ISSUE-0500" } },
          { rel: "duplicate_of", target: { id: "ISSUE-0500" } },
        ],
      }),
    ),
  ];

  try {
    for (const envelope of envelopesToIndex) {
      indexIssueEnvelope(database, envelope);
    }

    expect(readIssueEnvelope(database, "ISSUE-0500")).toEqual({
      ...mainEnvelope,
      derived: {
        children_ids: ["ISSUE-6001", "ISSUE-6002"],
        blocks_ids: ["ISSUE-7001", "ISSUE-7002"],
        blocked_by_ids: ["ISSUE-2000", "ISSUE-9999"],
        duplicates_ids: ["ISSUE-8001", "ISSUE-8002"],
        ready: false,
        is_blocked: true,
      },
    });
  } finally {
    database.close();
  }
});

test("readIssueEnvelope preserves explicit empty arrays from the projection row", () => {
  const database = openMemoryProjectionDatabase();
  const emptyCollectionsEnvelope = createEnvelope(
    createIssue({
      id: "ISSUE-0510",
      title: "Keep explicit empty collections",
      status: "accepted",
      labels: [],
      assignees: [],
      links: [],
    }),
    {
      revision: "rev-empty",
    },
  );

  try {
    indexIssueEnvelope(database, emptyCollectionsEnvelope);

    expect(readIssueEnvelope(database, "ISSUE-0510")).toEqual(
      emptyCollectionsEnvelope,
    );
  } finally {
    database.close();
  }
});

test("readIssueEnvelope omits absent optional fields from sparse issues and links", () => {
  const database = openMemoryProjectionDatabase();
  const sparseEnvelope = createEnvelope(
    createIssue({
      id: "ISSUE-0520",
      title: "Keep sparse issue shape canonical",
      status: "accepted",
      links: [{ rel: "related_to", target: { id: "ISSUE-9001" } }],
    }),
    {
      revision: "rev-sparse",
    },
  );

  try {
    indexIssueEnvelope(database, sparseEnvelope);

    const hydratedEnvelope = readIssueEnvelope(database, "ISSUE-0520");

    expect(hydratedEnvelope).toEqual(sparseEnvelope);
    expect(hydratedEnvelope).not.toBeNull();

    if (hydratedEnvelope == null) {
      throw new Error("Expected sparse issue envelope to be hydrated.");
    }

    expect(
      Object.prototype.hasOwnProperty.call(hydratedEnvelope.issue, "updated_at"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(hydratedEnvelope.issue, "summary"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(hydratedEnvelope.issue, "labels"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(hydratedEnvelope.issue.links?.[0] ?? {}, "note"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        hydratedEnvelope.issue.links?.[0]?.target ?? {},
        "href",
      ),
    ).toBe(false);
  } finally {
    database.close();
  }
});
