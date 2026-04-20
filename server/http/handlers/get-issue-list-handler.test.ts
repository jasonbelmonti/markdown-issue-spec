import { expect, test } from "bun:test";

import type { IssueEnvelope } from "../../core/types/index.ts";
import { createGetIssueListHandler } from "./get-issue-list-handler.ts";
import { DEFAULT_ISSUE_LIST_LIMIT } from "./list-issues-query-params.ts";

const PROJECTED_LIST_ITEM: IssueEnvelope = {
  issue: {
    spec_version: "mis/0.1",
    id: "ISSUE-3001",
    title: "Expose the list endpoint",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-19T12:10:00-05:00",
    updated_at: "2026-04-19T12:20:00-05:00",
    labels: ["api", "projection"],
    body: "## Objective\n\nList issue envelopes over HTTP.\n",
  },
  derived: {
    children_ids: [],
    blocks_ids: [],
    blocked_by_ids: [],
    duplicates_ids: [],
    ready: true,
    is_blocked: false,
  },
  revision: "rev-issue-3001",
  source: {
    file_path: "vault/issues/ISSUE-3001.md",
    indexed_at: "2026-04-19T12:21:00-05:00",
  },
};

test("createGetIssueListHandler delegates the normalized list query and returns paginated json", async () => {
  const observedQueries: unknown[] = [];
  const handler = createGetIssueListHandler((query) => {
    observedQueries.push(query);

    return {
      items: [PROJECTED_LIST_ITEM],
      nextCursor: "next-cursor-token",
    };
  });

  const response = await handler(
    new Request(
      "http://localhost/issues?status=accepted&label=api&ready=true&limit=25",
      {
        method: "GET",
      },
    ),
  );

  expect(observedQueries).toEqual([
    {
      status: "accepted",
      label: "api",
      ready: true,
      limit: 25,
    },
  ]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [PROJECTED_LIST_ITEM],
    next_cursor: "next-cursor-token",
  });
});

test("createGetIssueListHandler omits next_cursor when the projection page ends", async () => {
  const handler = createGetIssueListHandler(() => ({
    items: [],
    nextCursor: null,
  }));

  const response = await handler(
    new Request("http://localhost/issues", {
      method: "GET",
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [],
  });
});

test("createGetIssueListHandler returns deterministic 400 validation errors before delegation", async () => {
  let wasReaderCalled = false;
  const handler = createGetIssueListHandler(() => {
    wasReaderCalled = true;

    return {
      items: [],
      nextCursor: null,
    };
  });

  const response = await handler(
    new Request("http://localhost/issues?limit=0&ready=maybe", {
      method: "GET",
    }),
  );

  expect(wasReaderCalled).toBe(false);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_list_validation_failed",
      message: "Issue list validation failed.",
      details: {
        errors: [
          {
            code: "query.invalid_ready",
            source: "request",
            path: "/ready",
            message: "Query parameter `ready` must be `true` or `false`.",
            details: {
              ready: "maybe",
            },
          },
          {
            code: "query.invalid_limit",
            source: "request",
            path: "/limit",
            message: "Query parameter `limit` must be a positive integer.",
            details: {
              limit: "0",
            },
          },
        ],
      },
    },
  });
});

test("createGetIssueListHandler applies the default limit when none is provided", async () => {
  const observedQueries: unknown[] = [];
  const handler = createGetIssueListHandler((query) => {
    observedQueries.push(query);

    return {
      items: [],
      nextCursor: null,
    };
  });

  await handler(
    new Request("http://localhost/issues?status=accepted", {
      method: "GET",
    }),
  );

  expect(observedQueries).toEqual([
    {
      status: "accepted",
      limit: DEFAULT_ISSUE_LIST_LIMIT,
    },
  ]);
});
