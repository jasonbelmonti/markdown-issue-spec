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

test("handleCreateIssue returns a deterministic not-implemented response", async () => {
  const response = await handleCreateIssue(
    new Request("http://localhost/issues", {
      method: "POST",
    }),
  );

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

  const response = await handler(
    new Request("http://localhost/issues", {
      method: "POST",
    }),
  );

  expect(commands).toEqual([
    {
      kind: "create_issue",
    },
  ]);
  expect(response.status).toBe(501);
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
