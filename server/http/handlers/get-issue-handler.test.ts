import { expect, test } from "bun:test";

import type { IssueEnvelope } from "../../core/types/index.ts";
import type { HttpRouteRequest } from "../route-contract.ts";
import { createGetIssueHandler } from "./get-issue-handler.ts";

const PROJECTED_ENVELOPE: IssueEnvelope = {
  issue: {
    spec_version: "mis/0.1",
    id: "ISSUE-7777",
    title: "Read one issue from the projection",
    kind: "task",
    status: "in_progress",
    created_at: "2026-04-19T09:00:00-05:00",
    updated_at: "2026-04-19T09:30:00-05:00",
    labels: ["projection"],
    body: "## Objective\n\nRead this issue over HTTP.\n",
  },
  derived: {
    children_ids: ["ISSUE-8000"],
    blocks_ids: [],
    blocked_by_ids: ["ISSUE-4000"],
    duplicates_ids: [],
    ready: false,
    is_blocked: true,
  },
  revision: "rev-issue-7777",
  source: {
    file_path: "vault/issues/ISSUE-7777.md",
    indexed_at: "2026-04-19T09:45:00-05:00",
  },
};

test("createGetIssueHandler delegates to the issue-envelope reader and returns json", async () => {
  const observedIssueIds: string[] = [];
  const handler = createGetIssueHandler((issueId) => {
    observedIssueIds.push(issueId);

    return PROJECTED_ENVELOPE;
  });
  const request = Object.assign(
    new Request("http://localhost/issues/ignored", {
      method: "GET",
    }),
    {
      params: {
        id: PROJECTED_ENVELOPE.issue.id,
      },
    },
  ) as HttpRouteRequest;

  const response = await handler(request);

  expect(observedIssueIds).toEqual([PROJECTED_ENVELOPE.issue.id]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(PROJECTED_ENVELOPE);
});

test("createGetIssueHandler returns the existing issue_not_found contract when the issue is absent", async () => {
  const missingIssueId = "ISSUE-4040";
  const handler = createGetIssueHandler(() => null);

  const response = await handler(
    new Request(`http://localhost/issues/${missingIssueId}`, {
      method: "GET",
    }),
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_not_found",
      message: "The requested issue was not found.",
      details: {
        issueId: missingIssueId,
      },
    },
  });
});
