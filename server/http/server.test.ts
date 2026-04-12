import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemCreateIssueMutationBoundary } from "../application/mutations/filesystem-create-issue-mutation-boundary.ts";
import { createCreateIssueHandler } from "./handlers/create-issue-handler.ts";
import { handlePatchIssue } from "./handlers/patch-issue-handler.ts";
import { handleTransitionIssue } from "./handlers/transition-issue-handler.ts";
import { startServer } from "./server.ts";

const CREATE_ISSUE_REQUEST_BODY = {
  spec_version: "mis/0.1",
  title: "Bootstrap create route transport",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-12T09:45:00-05:00",
  body: "## Objective\n\nKeep the create route deterministic for valid JSON.",
} as const;

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-server-"));
}

async function withServer<T>(
  rootDirectory: string,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = startServer({
    port: 0,
    mutationHandlers: {
      createIssue: createCreateIssueHandler(
        createFilesystemCreateIssueMutationBoundary({
          rootDirectory,
        }),
      ),
      patchIssue: handlePatchIssue,
      transitionIssue: handleTransitionIssue,
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

test("startServer recognizes the planned mutation endpoints with a real create handler", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  await withServer(rootDirectory, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(CREATE_ISSUE_REQUEST_BODY),
    });
    const patchResponse = await fetch(`${baseUrl}/issues/ISSUE-1234`, {
      method: "PATCH",
    });
    const transitionResponse = await fetch(
      `${baseUrl}/issues/ISSUE-1234/transition`,
      { method: "POST" },
    );
    const createBody = await createResponse.json() as {
      issue: { id: string };
      source: { file_path: string };
    };

    expect(createResponse.status).toBe(201);
    expect(createBody.issue.id).toMatch(/^ISSUE-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(createBody.source.file_path).toBe(
      `vault/issues/${createBody.issue.id}.md`,
    );
    expect(await readdir(join(rootDirectory, "vault", "issues"))).toEqual([
      `${createBody.issue.id}.md`,
    ]);

    expect(patchResponse.status).toBe(501);
    expect(await patchResponse.json()).toEqual({
      error: {
        code: "issue_patch_not_implemented",
        message: "PATCH /issues/:id is not implemented yet.",
        details: {
          endpoint: "PATCH /issues/:id",
        },
      },
    });

    expect(transitionResponse.status).toBe(501);
    expect(await transitionResponse.json()).toEqual({
      error: {
        code: "issue_transition_not_implemented",
        message: "POST /issues/:id/transition is not implemented yet.",
        details: {
          endpoint: "POST /issues/:id/transition",
        },
      },
    });
  });
});

test("startServer keeps the structured json 404 fallback for unmatched routes", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  await withServer(rootDirectory, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "route_not_found",
        message: "No route matches the requested path.",
      },
    });
  });
});
