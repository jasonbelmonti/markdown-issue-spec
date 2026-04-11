import { expect, test } from "bun:test";

import { handleCreateIssue } from "./create-issue-handler.ts";
import { handlePatchIssue } from "./patch-issue-handler.ts";
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
