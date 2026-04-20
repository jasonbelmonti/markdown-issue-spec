import { expect, test } from "bun:test";

import { encodeIssueListCursor } from "../../projection/issue-list-cursor.ts";
import {
  DEFAULT_ISSUE_LIST_LIMIT,
  IssueListQueryValidationError,
  MAX_ISSUE_LIST_LIMIT,
  parseListIssuesQuery,
} from "./list-issues-query-params.ts";

function createIssuesRequest(pathnameWithSearch = "/issues"): Request {
  return new Request(`http://localhost${pathnameWithSearch}`, {
    method: "GET",
  });
}

test("parseListIssuesQuery maps supported single-valued filters onto the projection query", () => {
  const cursor = encodeIssueListCursor({
    utcSecond: "002026-04-19T17:20:00Z",
    fractionalDigits: "12",
    issueId: "ISSUE-3001",
  });

  expect(
    parseListIssuesQuery(
      createIssuesRequest(
        `/issues?status=accepted&kind=bug&label=backend&assignee=alex&parent_id=ISSUE-PARENT-1&depends_on_id=ISSUE-BLOCKER-OPEN&ready=true&updated_after=2026-04-19T12:00:00-05:00&limit=25&cursor=${cursor}`,
      ),
    ),
  ).toEqual({
    status: "accepted",
    kind: "bug",
    label: "backend",
    assignee: "alex",
    parentId: "ISSUE-PARENT-1",
    dependsOnId: "ISSUE-BLOCKER-OPEN",
    ready: true,
    updatedAfter: "2026-04-19T12:00:00-05:00",
    limit: 25,
    cursor,
  });
});

test("parseListIssuesQuery preserves positive updated_after offsets passed with a raw plus sign", () => {
  expect(
    parseListIssuesQuery(
      createIssuesRequest(
        "/issues?updated_after=2026-04-19T12:00:00+05:00",
      ),
    ),
  ).toEqual({
    updatedAfter: "2026-04-19T12:00:00+05:00",
    limit: DEFAULT_ISSUE_LIST_LIMIT,
  });
});

test("parseListIssuesQuery defaults limit when it is omitted", () => {
  expect(parseListIssuesQuery(createIssuesRequest())).toEqual({
    limit: DEFAULT_ISSUE_LIST_LIMIT,
  });
});

test("parseListIssuesQuery rejects limits above the maximum page size", () => {
  const request = createIssuesRequest(
    `/issues?limit=${MAX_ISSUE_LIST_LIMIT + 1}`,
  );

  try {
    parseListIssuesQuery(request);
    throw new Error("Expected query validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(IssueListQueryValidationError);

    if (!(error instanceof IssueListQueryValidationError)) {
      return;
    }

    expect(error.errors).toEqual([
      {
        code: "query.invalid_limit",
        source: "request",
        path: "/limit",
        message:
          `Query parameter \`limit\` must be a positive integer not exceeding ${MAX_ISSUE_LIST_LIMIT}.`,
        details: {
          limit: String(MAX_ISSUE_LIST_LIMIT + 1),
          maxLimit: MAX_ISSUE_LIST_LIMIT,
        },
      },
    ]);
  }
});

test("parseListIssuesQuery rejects invalid and repeated query parameters deterministically", () => {
  const request = createIssuesRequest(
    "/issues?status=accepted&status=completed&ready=maybe&limit=0&cursor=bad!&updated_after=not-a-timestamp&zzz=1",
  );

  expect(() => parseListIssuesQuery(request)).toThrow(
    IssueListQueryValidationError,
  );

  try {
    parseListIssuesQuery(request);
    throw new Error("Expected query validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(IssueListQueryValidationError);

    if (!(error instanceof IssueListQueryValidationError)) {
      return;
    }

    expect(error.errors).toEqual([
      {
        code: "query.unknown_parameter",
        source: "request",
        path: "/zzz",
        message: "Query parameter `zzz` is not supported.",
        details: {
          parameter: "zzz",
        },
      },
      {
        code: "query.repeated_parameter",
        source: "request",
        path: "/status",
        message: "Query parameter `status` must not be repeated.",
        details: {
          parameter: "status",
        },
      },
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
        code: "query.invalid_updated_after",
        source: "request",
        path: "/updated_after",
        message:
          "Query parameter `updated_after` must be a valid RFC3339 timestamp.",
        details: {
          updated_after: "not-a-timestamp",
        },
      },
      {
        code: "query.invalid_limit",
        source: "request",
        path: "/limit",
        message:
          `Query parameter \`limit\` must be a positive integer not exceeding ${MAX_ISSUE_LIST_LIMIT}.`,
        details: {
          limit: "0",
          maxLimit: MAX_ISSUE_LIST_LIMIT,
        },
      },
      {
        code: "query.invalid_cursor",
        source: "request",
        path: "/cursor",
        message: "Query parameter `cursor` is invalid.",
        details: {
          cursor: "bad!",
        },
      },
    ]);
  }
});

test("parseListIssuesQuery rejects invalid status and empty string filters", () => {
  const request = createIssuesRequest(
    "/issues?status=waiting&label=&parent_id=",
  );

  try {
    parseListIssuesQuery(request);
    throw new Error("Expected query validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(IssueListQueryValidationError);

    if (!(error instanceof IssueListQueryValidationError)) {
      return;
    }

    expect(error.errors).toEqual([
      {
        code: "query.invalid_status",
        source: "request",
        path: "/status",
        message:
          "Query parameter `status` must be one of `proposed`, `accepted`, `in_progress`, `completed`, or `canceled`.",
        details: {
          status: "waiting",
        },
      },
      {
        code: "query.invalid_label",
        source: "request",
        path: "/label",
        message: "Query parameter `label` must be a non-empty string.",
      },
      {
        code: "query.invalid_parent_id",
        source: "request",
        path: "/parent_id",
        message: "Query parameter `parent_id` must be a non-empty string.",
      },
    ]);
  }
});

test("parseListIssuesQuery still rejects updated_after values with encoded spaces", () => {
  const request = createIssuesRequest(
    "/issues?updated_after=2026-04-19T12:00:00%2005:00",
  );

  try {
    parseListIssuesQuery(request);
    throw new Error("Expected query validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(IssueListQueryValidationError);

    if (!(error instanceof IssueListQueryValidationError)) {
      return;
    }

    expect(error.errors).toEqual([
      {
        code: "query.invalid_updated_after",
        source: "request",
        path: "/updated_after",
        message:
          "Query parameter `updated_after` must be a valid RFC3339 timestamp.",
        details: {
          updated_after: "2026-04-19T12:00:00 05:00",
        },
      },
    ]);
  }
});
