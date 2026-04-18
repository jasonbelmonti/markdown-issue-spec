import { expect, test } from "bun:test";

import {
  createCreateIssueHandler,
} from "./create-issue-handler.ts";

const CREATE_ISSUE_REQUEST_BODY = {
  spec_version: "mis/0.1",
  title: "Implement create issue mutation",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-12T09:45:00-05:00",
  labels: ["api", "mutation"],
  body: "## Objective\n\nWire the create contract through the handler.",
} as const;

function createCreateIssueRequest(
  body: unknown = CREATE_ISSUE_REQUEST_BODY,
): Request {
  return new Request("http://localhost/issues", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createUnexpectedCreateIssueBoundary() {
  return {
    async createIssue() {
      throw new Error("createIssue should not be called for invalid requests.");
    },
  };
}

test("createCreateIssueHandler delegates to the mutation boundary", async () => {
  const commands: unknown[] = [];
  const handler = createCreateIssueHandler({
    async createIssue(command) {
      commands.push(command);

      return {
        status: "not_implemented",
        code: "issue_create_not_implemented",
        endpoint: "POST /issues",
      } as const;
    },
  });

  const response = await handler(createCreateIssueRequest());

  expect(commands).toEqual([
    {
      kind: "create_issue",
      input: CREATE_ISSUE_REQUEST_BODY,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createCreateIssueHandler returns deterministic JSON parse errors before delegation", async () => {
  const handler = createCreateIssueHandler(createUnexpectedCreateIssueBoundary());

  const response = await handler(
    new Request("http://localhost/issues", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: {
      code: "invalid_json_body",
      message: "Request body must contain valid JSON.",
    },
  });
});

test("createCreateIssueHandler returns deterministic unsupported media type errors before delegation", async () => {
  const handler = createCreateIssueHandler(createUnexpectedCreateIssueBoundary());

  const response = await handler(
    new Request("http://localhost/issues", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "not-json",
    }),
  );

  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({
    error: {
      code: "unsupported_media_type",
      message: "Request body must use application/json.",
      details: {
        contentType: "text/plain",
      },
    },
  });
});
