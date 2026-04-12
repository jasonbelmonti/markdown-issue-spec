import { expect, test } from "bun:test";

import {
  createCreateIssueHandler,
  handleCreateIssue,
} from "./create-issue-handler.ts";
import {
  createPatchIssueHandler,
  handlePatchIssue,
} from "./patch-issue-handler.ts";
import { handleTransitionIssue } from "./transition-issue-handler.ts";
import type { HttpRouteRequest } from "./types.ts";

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

test("handleCreateIssue returns a deterministic not-implemented response", async () => {
  const response = await handleCreateIssue(createCreateIssueRequest());

  expect(response.status).toBe(501);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_create_not_implemented",
      message: "POST /issues is not implemented yet.",
      details: {
        endpoint: "POST /issues",
      },
    },
  });
});

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

test("handlePatchIssue returns a deterministic not-implemented response", async () => {
  const response = await handlePatchIssue(
    new Request("http://localhost/issues/ISSUE-1234", {
      method: "PATCH",
    }),
  );

  expect(response.status).toBe(501);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_not_implemented",
      message: "PATCH /issues/:id is not implemented yet.",
      details: {
        endpoint: "PATCH /issues/:id",
      },
    },
  });
});

test("createPatchIssueHandler delegates to the mutation boundary with the issue id", async () => {
  const commands: unknown[] = [];
  const handler = createPatchIssueHandler({
    async patchIssue(command) {
      commands.push(command);

      return {
        status: "not_implemented",
        code: "issue_patch_not_implemented",
        endpoint: "PATCH /issues/:id",
      } as const;
    },
  });

  const response = await handler(
    new Request("http://localhost/issues/ISSUE-1234", {
      method: "PATCH",
    }),
  );

  expect(commands).toEqual([
    {
      kind: "patch_issue",
      issueId: "ISSUE-1234",
    },
  ]);
  expect(response.status).toBe(501);
});

test("createPatchIssueHandler prefers the decoded route param for issue ids", async () => {
  const commands: unknown[] = [];
  const handler = createPatchIssueHandler({
    async patchIssue(command) {
      commands.push(command);

      return {
        status: "not_implemented",
        code: "issue_patch_not_implemented",
        endpoint: "PATCH /issues/:id",
      } as const;
    },
  });

  const request = Object.assign(
    new Request("http://localhost/issues/ID%2F123", {
      method: "PATCH",
    }),
    {
      params: {
        id: "ID/123",
      },
    },
  ) as HttpRouteRequest;

  const response = await handler(request);

  expect(commands).toEqual([
    {
      kind: "patch_issue",
      issueId: "ID/123",
    },
  ]);
  expect(response.status).toBe(501);
});

test("createPatchIssueHandler falls back to the raw path segment when percent decoding fails", async () => {
  const commands: unknown[] = [];
  const handler = createPatchIssueHandler({
    async patchIssue(command) {
      commands.push(command);

      return {
        status: "not_implemented",
        code: "issue_patch_not_implemented",
        endpoint: "PATCH /issues/:id",
      } as const;
    },
  });

  const response = await handler(
    new Request("http://localhost/issues/%E0%A4%A", {
      method: "PATCH",
    }),
  );

  expect(commands).toEqual([
    {
      kind: "patch_issue",
      issueId: "%E0%A4%A",
    },
  ]);
  expect(response.status).toBe(501);
});

test("handleTransitionIssue returns a deterministic not-implemented response", async () => {
  const response = await handleTransitionIssue(
    new Request("http://localhost/issues/ISSUE-1234/transition", {
      method: "POST",
    }),
  );

  expect(response.status).toBe(501);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_transition_not_implemented",
      message: "POST /issues/:id/transition is not implemented yet.",
      details: {
        endpoint: "POST /issues/:id/transition",
      },
    },
  });
});
