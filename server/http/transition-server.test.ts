import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemTransitionIssueMutationBoundary } from "../application/mutations/filesystem-transition-issue-mutation-boundary.ts";
import type { Issue } from "../core/types/index.ts";
import { FilesystemIssueStore } from "../store/index.ts";
import { computeIssueRevision } from "../store/issue-revision.ts";
import { createTransitionIssueHandler } from "./handlers/transition-issue-handler.ts";
import type { HttpRouteDefinition, MutationRouteHandlers } from "./handlers/types.ts";
import { createMutationRouteDefinitions } from "./routes/mutation-routes.ts";

const TRANSITION_TIMESTAMP = "2026-04-12T13:45:00-05:00";

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-1234",
  title: "Implement transition route transport",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-12T09:45:00-05:00",
  updated_at: "2026-04-12T09:45:00-05:00",
  body: "## Objective\n\nVerify the live transition route.\n",
};

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-transition-server-"));
}

function postTransition(
  baseUrl: string,
  issueId: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/issues/${issueId}/transition`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function withServer<T>(
  rootDirectory: string,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const mutationHandlers: MutationRouteHandlers = {
    createIssue: () => new Response("unused", { status: 500 }),
    patchIssue: () => new Response("unused", { status: 500 }),
    transitionIssue: createTransitionIssueHandler(
      createFilesystemTransitionIssueMutationBoundary({
        rootDirectory,
        now: () => TRANSITION_TIMESTAMP,
      }),
    ),
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    routes: createBunRoutes(createMutationRouteDefinitions(mutationHandlers)),
    fetch() {
      return new Response("not found", { status: 404 });
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

function createBunRoutes(
  routeDefinitions: readonly HttpRouteDefinition[],
): Bun.Serve.Options["routes"] {
  const routes: NonNullable<Bun.Serve.Options["routes"]> = {};

  for (const routeDefinition of routeDefinitions) {
    const existingRoute = routes[routeDefinition.pathname];

    routes[routeDefinition.pathname] = {
      ...existingRoute,
      [routeDefinition.method]: routeDefinition.handler,
    };
  }

  return routes;
}

test("transition route serves live success, validation, and revision mismatch responses", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(EXISTING_ISSUE);
  const expectedRevision = computeIssueRevision(
    await Bun.file(store.getIssueFilePath(EXISTING_ISSUE.id)).text(),
  );

  await withServer(rootDirectory, async (baseUrl) => {
    const invalidTransitionResponse = await postTransition(baseUrl, EXISTING_ISSUE.id, {
      expectedRevision,
      to_status: "completed",
    });

    expect(invalidTransitionResponse.status).toBe(422);
    expect(await invalidTransitionResponse.json()).toEqual({
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

    const transitionResponse = await postTransition(baseUrl, EXISTING_ISSUE.id, {
      expectedRevision,
      to_status: "in_progress",
    });
    const transitionBody = await transitionResponse.json() as {
      issue: Issue;
      revision: string;
    };

    expect(transitionResponse.status).toBe(200);
    expect(transitionBody).toMatchObject({
      issue: {
        ...EXISTING_ISSUE,
        status: "in_progress",
        updated_at: TRANSITION_TIMESTAMP,
      },
      revision: expect.any(String),
    });

    const staleTransitionResponse = await postTransition(baseUrl, EXISTING_ISSUE.id, {
      expectedRevision,
      to_status: "completed",
    });

    expect(staleTransitionResponse.status).toBe(409);
    expect(await staleTransitionResponse.json()).toEqual({
      error: {
        code: "revision_mismatch",
        message: "The issue revision does not match the expected revision.",
        details: {
          issueId: EXISTING_ISSUE.id,
          expectedRevision,
          currentRevision: transitionBody.revision,
        },
      },
    });
  });
});

test("transition route serves issue_not_found for missing targets", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  await withServer(rootDirectory, async (baseUrl) => {
    const response = await postTransition(baseUrl, EXISTING_ISSUE.id, {
      expectedRevision: "revision-1",
      to_status: "in_progress",
    });

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
});
