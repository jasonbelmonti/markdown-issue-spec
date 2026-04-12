import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemPatchIssueMutationBoundary } from "../application/mutations/filesystem-patch-issue-mutation-boundary.ts";
import type { Issue } from "../core/types/index.ts";
import { FilesystemIssueStore } from "../store/index.ts";
import { computeIssueRevision } from "../store/issue-revision.ts";
import { createCreateIssueHandler } from "./handlers/create-issue-handler.ts";
import { createPatchIssueHandler } from "./handlers/patch-issue-handler.ts";
import { handleTransitionIssue } from "./handlers/transition-issue-handler.ts";
import { startServer } from "./server.ts";

const PATCH_TIMESTAMP = "2026-04-12T12:34:00-05:00";

const CREATE_ISSUE_REQUEST_BODY = {
  spec_version: "mis/0.1",
  title: "Bootstrap create route transport",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-12T09:45:00-05:00",
  body: "## Objective\n\nKeep the create route deterministic for valid JSON.",
} as const;

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-1234",
  title: "Implement patch issue mutation",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-12T09:45:00-05:00",
  updated_at: "2026-04-12T09:45:00-05:00",
  labels: ["api", "mutation"],
  body: "## Objective\n\nPatch this issue over HTTP.\n",
};

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
      createIssue: createCreateIssueHandler(),
      patchIssue: createPatchIssueHandler(
        createFilesystemPatchIssueMutationBoundary({
          rootDirectory,
          now: () => PATCH_TIMESTAMP,
        }),
      ),
      transitionIssue: handleTransitionIssue,
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

test("startServer serves the create placeholder plus real patch outcomes", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(EXISTING_ISSUE);

  await withServer(rootDirectory, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(CREATE_ISSUE_REQUEST_BODY),
    });
    const initialSource = await readFile(
      store.getIssueFilePath(EXISTING_ISSUE.id),
      "utf8",
    );
    const initialRevision = computeIssueRevision(initialSource);
    const patchResponse = await fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedRevision: initialRevision,
        title: "Patched over HTTP",
      }),
    });
    const patchBody = await patchResponse.json() as {
      issue: Issue;
      revision: string;
    };
    const stalePatchResponse = await fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedRevision: initialRevision,
        summary: "stale write",
      }),
    });
    const patchedSource = await readFile(
      store.getIssueFilePath(EXISTING_ISSUE.id),
      "utf8",
    );
    const invalidPatchResponse = await fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedRevision: patchBody.revision,
        title: "",
      }),
    });
    const transitionResponse = await fetch(
      `${baseUrl}/issues/${EXISTING_ISSUE.id}/transition`,
      { method: "POST" },
    );

    expect(createResponse.status).toBe(501);
    expect(await createResponse.json()).toEqual({
      error: {
        code: "issue_create_not_implemented",
        message: "POST /issues is not implemented yet.",
        details: {
          endpoint: "POST /issues",
        },
      },
    });

    expect(patchResponse.status).toBe(200);
    expect(patchBody).toMatchObject({
      issue: {
        ...EXISTING_ISSUE,
        title: "Patched over HTTP",
        updated_at: PATCH_TIMESTAMP,
      },
      revision: expect.any(String),
    });
    expect(await readdir(join(rootDirectory, "vault", "issues"))).toEqual([
      `${EXISTING_ISSUE.id}.md`,
    ]);

    expect(stalePatchResponse.status).toBe(409);
    expect(await stalePatchResponse.json()).toEqual({
      error: {
        code: "revision_mismatch",
        message: "The issue revision does not match the expected revision.",
        details: {
          issueId: EXISTING_ISSUE.id,
          expectedRevision: expect.any(String),
          currentRevision: patchBody.revision,
        },
      },
    });

    expect(invalidPatchResponse.status).toBe(422);
    expect(await invalidPatchResponse.json()).toMatchObject({
      error: {
        code: "issue_patch_validation_failed",
        message: "Issue patch validation failed.",
      },
    });
    expect(patchedSource).not.toBe(initialSource);
    expect(await readFile(store.getIssueFilePath(EXISTING_ISSUE.id), "utf8")).toBe(
      patchedSource,
    );

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
