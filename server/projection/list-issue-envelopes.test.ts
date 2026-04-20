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
} from "./index.ts";
import {
  listIssueEnvelopes,
  type ListIssueEnvelopesQuery,
} from "./list-issue-envelopes.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

interface IssueInput {
  id: string;
  title: string;
  kind?: string;
  status?: Issue["status"];
  resolution?: Issue["resolution"];
  createdAt?: string;
  updatedAt?: string;
  labels?: string[];
  assignees?: string[];
  links?: IssueLink[];
  body?: string;
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
  const status = input.status ?? "accepted";
  const issueBase = {
    spec_version: "mis/0.1" as const,
    id: input.id,
    title: input.title,
    kind: input.kind ?? "task",
    created_at: input.createdAt ?? "2026-04-19T09:00:00-05:00",
    ...(input.updatedAt === undefined
      ? {}
      : { updated_at: input.updatedAt }),
    ...(input.labels === undefined ? {} : { labels: input.labels }),
    ...(input.assignees === undefined ? {} : { assignees: input.assignees }),
    ...(input.links === undefined ? {} : { links: input.links }),
    ...(input.body === undefined ? {} : { body: input.body }),
  };

  if (status === "completed") {
    if (input.resolution !== "done") {
      throw new Error(`Issue ${input.id} requires a completed resolution.`);
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

function indexEnvelopes(
  database: ProjectionDatabase,
  envelopes: readonly IssueEnvelope[],
): void {
  for (const envelope of envelopes) {
    indexIssueEnvelope(database, envelope);
  }
}

function getIssueIds(envelopes: readonly IssueEnvelope[]): string[] {
  return envelopes.map((envelope) => envelope.issue.id);
}

function listIssueIds(
  database: ProjectionDatabase,
  query: ListIssueEnvelopesQuery,
): string[] {
  return getIssueIds(listIssueEnvelopes(database, query).items);
}

test("listIssueEnvelopes orders by effective updated timestamp descending with stable issue id ties", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-1002",
          title: "Latest explicit update wins",
          updatedAt: "2026-04-19T13:00:00-05:00",
          body: "Latest issue body.",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-1000",
          title: "Created timestamp is the effective sort key when updated_at is absent",
          createdAt: "2026-04-19T12:00:00-05:00",
          body: "Fallback body.",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-1001",
          title: "Equal effective timestamp falls back to issue id ordering",
          createdAt: "2026-04-19T11:00:00-05:00",
          updatedAt: "2026-04-19T12:00:00-05:00",
          body: "Tied body.",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-0999",
          title: "Older issue sorts last",
          updatedAt: "2026-04-19T10:00:00-05:00",
          body: "Old body.",
        }),
      ),
    ]);

    const page = listIssueEnvelopes(database, { limit: 10 });

    expect(getIssueIds(page.items)).toEqual([
      "ISSUE-1002",
      "ISSUE-1000",
      "ISSUE-1001",
      "ISSUE-0999",
    ]);
    expect(page.items[1]?.issue.body).toBe("Fallback body.");
    expect(page.nextCursor).toBeNull();
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes uses an opaque cursor that resumes without duplicates across tied timestamps", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2000",
          title: "Newest issue",
          updatedAt: "2026-04-19T15:00:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2001",
          title: "Tie one",
          createdAt: "2026-04-19T14:00:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2002",
          title: "Tie two",
          updatedAt: "2026-04-19T14:00:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2003",
          title: "Older issue",
          updatedAt: "2026-04-19T13:00:00-05:00",
        }),
      ),
    ]);

    const firstPage = listIssueEnvelopes(database, { limit: 2 });

    expect(getIssueIds(firstPage.items)).toEqual(["ISSUE-2000", "ISSUE-2001"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.nextCursor).not.toContain("ISSUE-2001");

    const secondPage = listIssueEnvelopes(database, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(getIssueIds(secondPage.items)).toEqual(["ISSUE-2002", "ISSUE-2003"]);
    expect(secondPage.nextCursor).toBeNull();
    expect([
      ...getIssueIds(firstPage.items),
      ...getIssueIds(secondPage.items),
    ]).toEqual([
      "ISSUE-2000",
      "ISSUE-2001",
      "ISSUE-2002",
      "ISSUE-2003",
    ]);
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes rejects malformed cursor payloads", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2050",
          title: "Cursor repro issue",
          updatedAt: "2026-04-19T15:00:00-05:00",
        }),
      ),
    ]);

    const malformedCursor = Buffer.from(
      JSON.stringify({
        v: 2,
        utcSecond: "A",
        fractionalDigits: "not-digits",
        issueId: "ISSUE-9999",
      }),
      "utf8",
    )
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");

    expect(() =>
      listIssueEnvelopes(database, {
        limit: 10,
        cursor: malformedCursor,
      })
    ).toThrow("Issue list cursor is invalid.");
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes applies updatedAfter using the effective timestamp when updated_at is absent", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2100",
          title: "Created after threshold",
          createdAt: "2026-04-19T12:30:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2101",
          title: "Updated after threshold",
          createdAt: "2026-04-19T10:00:00-05:00",
          updatedAt: "2026-04-19T12:45:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2102",
          title: "Before threshold",
          createdAt: "2026-04-19T11:00:00-05:00",
        }),
      ),
    ]);

    const page = listIssueEnvelopes(database, {
      limit: 10,
      updatedAfter: "2026-04-19T12:00:00-05:00",
    });

    expect(listIssueIds(database, {
      limit: 10,
      updatedAfter: "2026-04-19T12:00:00-05:00",
    })).toEqual(["ISSUE-2101", "ISSUE-2100"]);
    expect(page.nextCursor).toBeNull();
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes compares mixed-offset timestamps by instant for ordering and updatedAfter", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2200",
          title: "Older positive-offset issue",
          createdAt: "2026-04-19T23:00:00+02:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2201",
          title: "Newest UTC issue",
          createdAt: "2026-04-19T22:30:00Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2202",
          title: "Middle negative-offset issue",
          createdAt: "2026-04-19T17:15:00-05:00",
        }),
      ),
    ]);

    expect(listIssueIds(database, { limit: 10 })).toEqual([
      "ISSUE-2201",
      "ISSUE-2202",
      "ISSUE-2200",
    ]);
    expect(listIssueIds(database, {
      limit: 10,
      updatedAfter: "2026-04-19T22:00:00Z",
    })).toEqual(["ISSUE-2201", "ISSUE-2202"]);
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes resumes pagination correctly across mixed-offset timestamps", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2300",
          title: "Oldest positive-offset issue",
          createdAt: "2026-04-19T23:00:00+02:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2301",
          title: "Newest UTC issue",
          createdAt: "2026-04-19T22:30:00Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2302",
          title: "Middle negative-offset issue",
          createdAt: "2026-04-19T17:15:00-05:00",
        }),
      ),
    ]);

    const firstPage = listIssueEnvelopes(database, { limit: 2 });

    expect(getIssueIds(firstPage.items)).toEqual(["ISSUE-2301", "ISSUE-2302"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = listIssueEnvelopes(database, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(getIssueIds(secondPage.items)).toEqual(["ISSUE-2300"]);
    expect(secondPage.nextCursor).toBeNull();
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes accepts schema-valid years below 0100", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2350",
          title: "Earlier century issue",
          createdAt: "0099-04-19T22:30:00Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2351",
          title: "Later century issue",
          createdAt: "0100-04-19T22:30:00Z",
        }),
      ),
    ]);

    expect(listIssueIds(database, { limit: 10 })).toEqual([
      "ISSUE-2351",
      "ISSUE-2350",
    ]);
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes preserves ordering across UTC year rollover after offset normalization", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2360",
          title: "Earlier extended-year instant",
          createdAt: "9999-12-31T23:59:58-23:59",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2361",
          title: "Later extended-year instant",
          createdAt: "9999-12-31T23:59:59-23:59",
        }),
      ),
    ]);

    expect(listIssueIds(database, { limit: 10 })).toEqual([
      "ISSUE-2361",
      "ISSUE-2360",
    ]);
    expect(listIssueIds(database, {
      limit: 10,
      updatedAfter: "9999-12-31T23:59:58-23:59",
    })).toEqual(["ISSUE-2361"]);
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes preserves sub-millisecond precision for ordering and updatedAfter", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2400",
          title: "Earliest precise timestamp",
          createdAt: "2026-04-19T22:30:00.0003Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2401",
          title: "Latest precise timestamp",
          createdAt: "2026-04-19T22:30:00.0004Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2402",
          title: "Middle precise timestamp",
          createdAt: "2026-04-19T22:30:00.00035Z",
        }),
      ),
    ]);

    expect(listIssueIds(database, { limit: 10 })).toEqual([
      "ISSUE-2401",
      "ISSUE-2402",
      "ISSUE-2400",
    ]);
    expect(listIssueIds(database, {
      limit: 10,
      updatedAfter: "2026-04-19T22:30:00.00035Z",
    })).toEqual(["ISSUE-2401"]);
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes resumes pagination correctly across sub-millisecond timestamps", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-2500",
          title: "Earliest precise timestamp",
          createdAt: "2026-04-19T22:30:00.0003Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2501",
          title: "Latest precise timestamp",
          createdAt: "2026-04-19T22:30:00.0004Z",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-2502",
          title: "Middle precise timestamp",
          createdAt: "2026-04-19T22:30:00.00035Z",
        }),
      ),
    ]);

    const firstPage = listIssueEnvelopes(database, { limit: 2 });

    expect(getIssueIds(firstPage.items)).toEqual(["ISSUE-2501", "ISSUE-2502"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = listIssueEnvelopes(database, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(getIssueIds(secondPage.items)).toEqual(["ISSUE-2500"]);
    expect(secondPage.nextCursor).toBeNull();
  } finally {
    database.close();
  }
});

test("listIssueEnvelopes supports the MVP filters and preserves the selected order after hydration", () => {
  const database = openMemoryProjectionDatabase();

  try {
    indexEnvelopes(database, [
      createEnvelope(
        createIssue({
          id: "ISSUE-BLOCKER-OPEN",
          title: "Open blocker",
          kind: "dependency",
          status: "accepted",
          createdAt: "2026-04-19T09:00:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-BLOCKER-DONE",
          title: "Completed blocker",
          kind: "dependency",
          status: "completed",
          resolution: "done",
          createdAt: "2026-04-19T09:05:00-05:00",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-3000",
          title: "Backend task with open blocker",
          kind: "task",
          status: "accepted",
          createdAt: "2026-04-19T12:05:00-05:00",
          labels: ["candidate", "backend"],
          assignees: ["jason"],
          links: [
            { rel: "parent", target: { id: "ISSUE-PARENT-1" } },
            {
              rel: "depends_on",
              target: { id: "ISSUE-BLOCKER-OPEN" },
              required_before: "in_progress",
            },
          ],
          body: "Task body.",
        }),
        {
          derived: {
            ready: false,
            is_blocked: true,
            blocked_by_ids: ["ISSUE-BLOCKER-OPEN"],
          },
        },
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-3001",
          title: "Backend bug that is ready",
          kind: "bug",
          status: "accepted",
          createdAt: "2026-04-19T12:10:00-05:00",
          updatedAt: "2026-04-19T12:20:00-05:00",
          labels: ["candidate", "backend"],
          assignees: ["alex"],
          links: [{ rel: "parent", target: { id: "ISSUE-PARENT-1" } }],
          body: "Bug body.",
        }),
      ),
      createEnvelope(
        createIssue({
          id: "ISSUE-3002",
          title: "Platform task with completed dependency",
          kind: "task",
          status: "completed",
          resolution: "done",
          createdAt: "2026-04-19T12:15:00-05:00",
          updatedAt: "2026-04-19T12:45:00-05:00",
          labels: ["candidate", "ops"],
          assignees: ["jason"],
          links: [
            {
              rel: "depends_on",
              target: { id: "ISSUE-BLOCKER-DONE" },
              required_before: "completed",
            },
          ],
          body: "Completed body.",
        }),
      ),
    ]);

    expect(listIssueIds(database, {
      limit: 10,
      status: "accepted",
      label: "candidate",
    })).toEqual(["ISSUE-3001", "ISSUE-3000"]);
    expect(listIssueIds(database, {
      limit: 10,
      kind: "bug",
      label: "candidate",
    })).toEqual(["ISSUE-3001"]);
    expect(listIssueIds(database, {
      limit: 10,
      label: "backend",
    })).toEqual(["ISSUE-3001", "ISSUE-3000"]);
    expect(listIssueIds(database, {
      limit: 10,
      assignee: "jason",
      label: "candidate",
    })).toEqual(["ISSUE-3002", "ISSUE-3000"]);
    expect(listIssueIds(database, {
      limit: 10,
      parentId: "ISSUE-PARENT-1",
    })).toEqual(["ISSUE-3001", "ISSUE-3000"]);
    expect(listIssueIds(database, {
      limit: 10,
      dependsOnId: "ISSUE-BLOCKER-OPEN",
    })).toEqual(["ISSUE-3000"]);
    expect(listIssueIds(database, {
      limit: 10,
      ready: true,
      label: "candidate",
    })).toEqual(["ISSUE-3002", "ISSUE-3001"]);
    expect(listIssueIds(database, {
      limit: 10,
      status: "accepted",
      kind: "bug",
      label: "backend",
      assignee: "alex",
      parentId: "ISSUE-PARENT-1",
      ready: true,
      updatedAfter: "2026-04-19T12:00:00-05:00",
    })).toEqual(["ISSUE-3001"]);

    const hydratedPage = listIssueEnvelopes(database, {
      limit: 10,
      label: "candidate",
    });

    expect(getIssueIds(hydratedPage.items)).toEqual([
      "ISSUE-3002",
      "ISSUE-3001",
      "ISSUE-3000",
    ]);
    expect(hydratedPage.items[2]).toMatchObject({
      issue: {
        id: "ISSUE-3000",
        body: "Task body.",
      },
      derived: {
        blocked_by_ids: ["ISSUE-BLOCKER-OPEN"],
        ready: false,
        is_blocked: true,
      },
    });
  } finally {
    database.close();
  }
});
