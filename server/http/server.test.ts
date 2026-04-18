import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemCreateIssueMutationBoundary } from "../application/mutations/filesystem-create-issue-mutation-boundary.ts";
import { createFilesystemIssueMutationLock } from "../application/mutations/filesystem-issue-mutation-lock.ts";
import { createFilesystemPatchIssueMutationBoundary } from "../application/mutations/filesystem-patch-issue-mutation-boundary.ts";
import type { Issue, IssueEnvelope } from "../core/types/index.ts";
import { FilesystemIssueStore } from "../store/index.ts";
import { computeIssueRevision } from "../store/issue-revision.ts";
import { createCreateIssueHandler } from "./handlers/create-issue-handler.ts";
import { createPatchIssueHandler } from "./handlers/patch-issue-handler.ts";
import { startServer } from "./server.ts";

const CREATE_TIMESTAMP = "2026-04-16T20:59:00-05:00";
const CREATED_ISSUE_ID = "ISSUE-00000000000000000000000012";
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
      createIssue: createCreateIssueHandler(
        createFilesystemCreateIssueMutationBoundary({
          rootDirectory,
          issueIdGenerator: () => CREATED_ISSUE_ID,
          now: () => CREATE_TIMESTAMP,
        }),
      ),
      patchIssue: createPatchIssueHandler(
        createFilesystemPatchIssueMutationBoundary({
          rootDirectory,
          now: () => PATCH_TIMESTAMP,
        }),
      ),
      transitionIssue: () => new Response("unused", { status: 500 }),
    },
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

test("startServer serves real create and patch outcomes", async () => {
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
    const createBody = await createResponse.json() as IssueEnvelope;
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

    expect(createResponse.status).toBe(201);
    expect(createBody).toMatchObject({
      issue: {
        id: CREATED_ISSUE_ID,
        spec_version: CREATE_ISSUE_REQUEST_BODY.spec_version,
        title: CREATE_ISSUE_REQUEST_BODY.title,
        kind: CREATE_ISSUE_REQUEST_BODY.kind,
        status: CREATE_ISSUE_REQUEST_BODY.status,
        created_at: CREATE_ISSUE_REQUEST_BODY.created_at,
        body: CREATE_ISSUE_REQUEST_BODY.body,
      },
      revision: expect.any(String),
      source: {
        file_path: `vault/issues/${CREATED_ISSUE_ID}.md`,
        indexed_at: CREATE_TIMESTAMP,
      },
    });
    expect(await store.readIssue(CREATED_ISSUE_ID)).toEqual(createBody.issue);

    expect(patchResponse.status).toBe(200);
    expect(patchBody).toMatchObject({
      issue: {
        ...EXISTING_ISSUE,
        title: "Patched over HTTP",
        updated_at: PATCH_TIMESTAMP,
      },
      revision: expect.any(String),
    });
    expect((await readdir(join(rootDirectory, "vault", "issues"))).sort()).toEqual([
      `${CREATED_ISSUE_ID}.md`,
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

test("startServer rejects invalid create requests without writing issue files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();

  await withServer(rootDirectory, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...CREATE_ISSUE_REQUEST_BODY,
        body: 123,
      }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "issue_create_validation_failed",
        message: "Issue create validation failed.",
        details: {
          errors: [
            {
              code: "create.invalid_body",
              source: "request",
              path: "/body",
              message: "Create `body` must be a string when present.",
            },
          ],
        },
      },
    });
  });

  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("startServer serializes concurrent create and patch writes that share a repository mutation lock", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const store = new FilesystemIssueStore({ rootDirectory });
  const mutationLock = createFilesystemIssueMutationLock();
  let releaseCreatePersist!: () => void;
  const createPersistReleased = new Promise<void>((resolve) => {
    releaseCreatePersist = resolve;
  });
  let markCreatePersistReached!: () => void;
  const createPersistReached = new Promise<void>((resolve) => {
    markCreatePersistReached = resolve;
  });

  await store.writeIssue(EXISTING_ISSUE);

  const server = startServer({
    port: 0,
    mutationHandlers: {
      createIssue: createCreateIssueHandler(
        createFilesystemCreateIssueMutationBoundary({
          rootDirectory,
          issueIdGenerator: () => CREATED_ISSUE_ID,
          now: () => CREATE_TIMESTAMP,
          mutationLock,
          beforePersist: async () => {
            markCreatePersistReached();
            await createPersistReleased;
          },
        }),
      ),
      patchIssue: createPatchIssueHandler(
        createFilesystemPatchIssueMutationBoundary({
          rootDirectory,
          now: () => PATCH_TIMESTAMP,
          mutationLock,
        }),
      ),
      transitionIssue: () => new Response("unused", { status: 500 }),
    },
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const expectedRevision = computeIssueRevision(
      await readFile(store.getIssueFilePath(EXISTING_ISSUE.id), "utf8"),
    );
    const createResponsePromise = fetch(`${baseUrl}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(CREATE_ISSUE_REQUEST_BODY),
    });

    await createPersistReached;

    const patchResponsePromise = fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedRevision,
        links: [
          {
            rel: "parent",
            target: CREATED_ISSUE_ID,
          },
        ],
      }),
    });

    releaseCreatePersist();

    const [createResponse, patchResponse] = await Promise.all([
      createResponsePromise,
      patchResponsePromise,
    ]);
    const patchBody = await patchResponse.json() as IssueEnvelope;

    expect(createResponse.status).toBe(201);
    expect(patchResponse.status).toBe(200);
    expect(patchBody.issue.links).toEqual([
      {
        rel: "parent",
        target: {
          id: CREATED_ISSUE_ID,
        },
      },
    ]);
    expect(await store.readIssue(CREATED_ISSUE_ID)).toMatchObject({
      id: CREATED_ISSUE_ID,
      title: CREATE_ISSUE_REQUEST_BODY.title,
    });
  } finally {
    server.stop(true);
  }
});
