import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemTransitionIssueMutationBoundary } from "../../application/mutations/filesystem-transition-issue-mutation-boundary.ts";
import type { Issue } from "../../core/types/index.ts";
import type { HttpRouteRequest } from "../route-contract.ts";
import { computeIssueRevision } from "../../store/issue-revision.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import { createTransitionIssueHandler } from "./transition-issue-handler.ts";

const TRANSITION_TIMESTAMP = "2026-04-16T22:30:00-05:00";

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-1234",
  title: "Implement transition issue mutation",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-16T09:45:00-05:00",
  updated_at: "2026-04-16T09:45:00-05:00",
  body: "## Objective\n\nTransition me through the mutation boundary.\n",
};

function createTransitionIssueRequest(
  body: unknown,
  issueId = EXISTING_ISSUE.id,
): Request {
  return new Request(
    `http://localhost/issues/${encodeURIComponent(issueId)}/transition`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-transition-handler-"));
}

function createRealTransitionIssueHandler(
  rootDirectory: string,
  options: Omit<
    Parameters<typeof createFilesystemTransitionIssueMutationBoundary>[0],
    "rootDirectory"
  > = {},
) {
  return createTransitionIssueHandler(
    createFilesystemTransitionIssueMutationBoundary({
      rootDirectory,
      ...options,
    }),
  );
}

function createUnexpectedTransitionIssueBoundary() {
  return {
    async transitionIssue() {
      throw new Error("transitionIssue should not be called for invalid requests.");
    },
  };
}

async function writeCanonicalIssue(
  rootDirectory: string,
  issue: Issue = EXISTING_ISSUE,
): Promise<FilesystemIssueStore> {
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(issue);

  return store;
}

async function readIssueSource(
  rootDirectory: string,
  issueId: string,
): Promise<string> {
  const store = new FilesystemIssueStore({ rootDirectory });

  return readFile(store.getIssueFilePath(issueId), "utf8");
}

async function readIssueRevision(
  rootDirectory: string,
  issueId: string,
): Promise<string> {
  return computeIssueRevision(await readIssueSource(rootDirectory, issueId));
}

test("createTransitionIssueHandler delegates to the mutation boundary with the issue id and parsed input", async () => {
  const commands: unknown[] = [];
  const requestBody = {
    expectedRevision: "revision-1",
    to_status: "in_progress",
  };
  const handler = createTransitionIssueHandler({
    async transitionIssue(command) {
      commands.push(command);

      return {
        status: "not_implemented",
        code: "issue_transition_not_implemented",
        endpoint: "POST /issues/:id/transition",
      } as const;
    },
  });

  const response = await handler(createTransitionIssueRequest(requestBody));

  expect(commands).toEqual([
    {
      kind: "transition_issue",
      issueId: EXISTING_ISSUE.id,
      input: requestBody,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createTransitionIssueHandler prefers the decoded route param for issue ids", async () => {
  const commands: unknown[] = [];
  const requestBody = {
    expectedRevision: "revision-1",
    to_status: "in_progress",
  };
  const handler = createTransitionIssueHandler({
    async transitionIssue(command) {
      commands.push(command);

      return {
        status: "not_implemented",
        code: "issue_transition_not_implemented",
        endpoint: "POST /issues/:id/transition",
      } as const;
    },
  });

  const request = Object.assign(
    createTransitionIssueRequest(requestBody, "ID/123"),
    {
      params: {
        id: "ID/123",
      },
    },
  ) as HttpRouteRequest;

  const response = await handler(request);

  expect(commands).toEqual([
    {
      kind: "transition_issue",
      issueId: "ID/123",
      input: requestBody,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createTransitionIssueHandler returns deterministic JSON parse errors before delegation", async () => {
  const handler = createTransitionIssueHandler(
    createUnexpectedTransitionIssueBoundary(),
  );

  const response = await handler(
    new Request("http://localhost/issues/ISSUE-1234/transition", {
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

test("createTransitionIssueHandler returns deterministic unsupported media type errors before delegation", async () => {
  const handler = createTransitionIssueHandler(
    createUnexpectedTransitionIssueBoundary(),
  );

  const response = await handler(
    new Request("http://localhost/issues/ISSUE-1234/transition", {
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

test("createTransitionIssueHandler maps invalid issue ids to deterministic validation errors", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealTransitionIssueHandler(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  const response = await handler(
    Object.assign(
      createTransitionIssueRequest(
        {
          expectedRevision: "revision-1",
          to_status: "in_progress",
        },
        "ID/123",
      ),
      {
        params: {
          id: "ID/123",
        },
      },
    ) as HttpRouteRequest,
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_transition_validation_failed",
      message: "Issue transition validation failed.",
      details: {
        errors: [
          {
            code: "transition.invalid_issue_id",
            source: "request",
            path: "/id",
            message:
              'Issue id "ID/123" cannot contain path separators when building filesystem paths.',
            details: {
              issueId: "ID/123",
            },
          },
        ],
      },
    },
  });
});

test("createTransitionIssueHandler maps revision mismatches to deterministic 409 responses", async () => {
  const handler = createTransitionIssueHandler({
    async transitionIssue() {
      return {
        status: "revision_mismatch",
        issueId: EXISTING_ISSUE.id,
        expectedRevision: "revision-1",
        currentRevision: "revision-2",
      } as const;
    },
  });

  const response = await handler(
    createTransitionIssueRequest({
      expectedRevision: "revision-1",
      to_status: "in_progress",
    }),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: {
      code: "revision_mismatch",
      message: "The issue revision does not match the expected revision.",
      details: {
        issueId: EXISTING_ISSUE.id,
        expectedRevision: "revision-1",
        currentRevision: "revision-2",
      },
    },
  });
});

test("createTransitionIssueHandler returns 404 when the issue does not exist", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealTransitionIssueHandler(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  const response = await handler(
    createTransitionIssueRequest({
      expectedRevision: "revision-1",
      to_status: "in_progress",
    }),
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_not_found",
      message: "The requested issue was not found.",
      details: {
        issueId: EXISTING_ISSUE.id,
      },
    },
  });
});

test("createTransitionIssueHandler returns 200 with a persisted transitioned issue envelope", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealTransitionIssueHandler(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createTransitionIssueRequest({
      expectedRevision,
      to_status: "in_progress",
    }),
  );
  const responseBody = await response.json() as {
    issue: Issue;
    revision: string;
    source: { file_path: string; indexed_at: string };
  };

  expect(response.status).toBe(200);
  expect(responseBody).toMatchObject({
    issue: {
      ...EXISTING_ISSUE,
      status: "in_progress",
      updated_at: TRANSITION_TIMESTAMP,
    },
    derived: {
      children_ids: [],
      blocks_ids: [],
      blocked_by_ids: [],
      duplicates_ids: [],
      ready: true,
      is_blocked: false,
    },
    revision: expect.any(String),
    source: {
      file_path: `vault/issues/${EXISTING_ISSUE.id}.md`,
      indexed_at: TRANSITION_TIMESTAMP,
    },
  });
  expect(responseBody.revision).not.toBe(expectedRevision);
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(responseBody.issue);
});

test("createTransitionIssueHandler rejects lifecycle guard failures with deterministic validation errors and no write", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealTransitionIssueHandler(rootDirectory, {
    now: () => TRANSITION_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createTransitionIssueRequest({
      expectedRevision,
      to_status: "completed",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_transition_validation_failed",
      message: "Issue transition validation failed.",
      details: {
        errors: [
          {
            code: "transition.completed_requires_in_progress",
            source: "transition_guard",
            path: "/status",
            message:
              "Issue must enter `in_progress` before it can transition to `completed`.",
            details: {
              issueId: EXISTING_ISSUE.id,
              currentStatus: "accepted",
              nextStatus: "completed",
            },
            related_issue_ids: [EXISTING_ISSUE.id],
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});
