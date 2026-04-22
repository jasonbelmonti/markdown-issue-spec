import { expect, test } from "bun:test";
import { mkdtemp, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemIssueMutationLock } from "../application/mutations/filesystem-issue-mutation-lock.ts";
import type { Issue, IssueEnvelope } from "../core/types/index.ts";
import {
  indexIssueEnvelope,
  listIssueEnvelopes,
  listValidationErrors,
  openProjectionDatabase,
  readIssueEnvelope,
} from "../projection/index.ts";
import { scanIssueFilesIntoProjection } from "../startup/index.ts";
import { createFilesystemProjectionRebuilder } from "../startup/filesystem-projection-rebuilder.ts";
import { FilesystemIssueStore } from "../store/index.ts";
import { computeIssueRevision } from "../store/issue-revision.ts";
import { createFilesystemAdminRouteHandlers } from "./handlers/filesystem-admin-handlers.ts";
import { createGetIssueHandler } from "./handlers/get-issue-handler.ts";
import { createGetIssueListHandler } from "./handlers/get-issue-list-handler.ts";
import { createGetValidationErrorListHandler } from "./handlers/get-validation-error-list-handler.ts";
import { createFilesystemPatchIssueMutationBoundary } from "../application/mutations/filesystem-patch-issue-mutation-boundary.ts";
import { createPatchIssueHandler } from "./handlers/patch-issue-handler.ts";
import type {
  AdminRouteHandlers,
  MutationRouteHandlers,
  QueryRouteHandlers,
} from "./handlers/types.ts";
import { startServer } from "./server.ts";

type ProjectionDatabase = ReturnType<typeof openProjectionDatabase>;

const STARTUP_INDEXED_AT = "2026-04-21T11:15:00-05:00";
const PATCH_TIMESTAMP = "2026-04-21T11:25:00-05:00";

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-1234",
  title: "Prove startup scan coherence",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-21T10:00:00-05:00",
  updated_at: "2026-04-21T10:05:00-05:00",
  labels: ["integration", "projection"],
  body: "## Objective\n\nSeed the projection from canonical Markdown.\n",
};

const STALE_PROJECTED_ISSUE: IssueEnvelope = {
  issue: {
    spec_version: "mis/0.1",
    id: "ISSUE-STALE",
    title: "Projection row that should be removed",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-21T10:30:00-05:00",
    updated_at: "2026-04-21T10:35:00-05:00",
    body: "## Objective\n\nDisappear during rebuild.\n",
  },
  derived: {
    children_ids: [],
    blocks_ids: [],
    blocked_by_ids: [],
    duplicates_ids: [],
    ready: true,
    is_blocked: false,
  },
  revision: "rev-stale",
  source: {
    file_path: "vault/issues/ISSUE-STALE.md",
    indexed_at: "2026-04-21T10:40:00-05:00",
  },
};

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-coherence-"));
}

function createQueryHandlers(database: ProjectionDatabase): QueryRouteHandlers {
  return {
    getIssue: createGetIssueHandler((issueId) => readIssueEnvelope(database, issueId)),
    listIssues: createGetIssueListHandler((query) => listIssueEnvelopes(database, query)),
    listValidationErrors: createGetValidationErrorListHandler((query) =>
      listValidationErrors(database, query)
    ),
  };
}

async function withServer<T>(
  options: {
    adminHandlers: AdminRouteHandlers;
    mutationHandlers: MutationRouteHandlers;
    queryHandlers: QueryRouteHandlers;
  },
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = startServer({
    port: 0,
    adminHandlers: options.adminHandlers,
    mutationHandlers: options.mutationHandlers,
    queryHandlers: options.queryHandlers,
  });

  try {
    return await run(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop(true);
  }
}

test("startup scan, accepted patch writes, and rebuild keep canonical Markdown and projection coherent", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const databasePath = join(rootDirectory, ".mis", "index.sqlite");
  const database = openProjectionDatabase(databasePath);
  const store = new FilesystemIssueStore({ rootDirectory });
  const mutationLock = createFilesystemIssueMutationLock();
  const rebuildProjection = createFilesystemProjectionRebuilder({
    rootDirectory,
    databasePath,
  });

  await store.writeIssue(EXISTING_ISSUE);

  try {
    const startupResult = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: STARTUP_INDEXED_AT,
    });
    const projectedAfterStartup = readIssueEnvelope(database, EXISTING_ISSUE.id);

    expect(startupResult.failures).toEqual([]);
    expect(startupResult.issueEnvelopes.map((envelope) => envelope.issue.id)).toEqual([
      EXISTING_ISSUE.id,
    ]);
    expect(projectedAfterStartup).toMatchObject({
      issue: EXISTING_ISSUE,
      source: {
        file_path: `vault/issues/${EXISTING_ISSUE.id}.md`,
        indexed_at: STARTUP_INDEXED_AT,
      },
      revision: computeIssueRevision(
        await readFile(store.getIssueFilePath(EXISTING_ISSUE.id), "utf8"),
      ),
    });

    await withServer(
      {
        adminHandlers: createFilesystemAdminRouteHandlers({
          rootDirectory,
          databasePath,
          mutationLock,
        }),
        mutationHandlers: {
          createIssue: () => new Response("unused", { status: 500 }),
          patchIssue: createPatchIssueHandler(
            createFilesystemPatchIssueMutationBoundary({
              rootDirectory,
              now: () => PATCH_TIMESTAMP,
              afterPersist: rebuildProjection,
              mutationLock,
            }),
          ),
          transitionIssue: () => new Response("unused", { status: 500 }),
        },
        queryHandlers: createQueryHandlers(database),
      },
      async (baseUrl) => {
        const startupReadResponse = await fetch(
          `${baseUrl}/issues/${EXISTING_ISSUE.id}`,
        );

        expect(startupReadResponse.status).toBe(200);
        expect(await startupReadResponse.json()).toMatchObject(projectedAfterStartup!);

        const patchResponse = await fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expectedRevision: projectedAfterStartup!.revision,
            title: "Projection stays aligned after patch",
            body:
              "## Objective\n\nKeep canonical Markdown and SQLite aligned after accepted writes.\n",
          }),
        });
        const patchedEnvelope = await patchResponse.json() as IssueEnvelope;
        const patchedCanonicalSource = await readFile(
          store.getIssueFilePath(EXISTING_ISSUE.id),
          "utf8",
        );

        expect(patchResponse.status).toBe(200);
        expect(patchedEnvelope).toMatchObject({
          issue: {
            ...EXISTING_ISSUE,
            title: "Projection stays aligned after patch",
            updated_at: PATCH_TIMESTAMP,
            body:
              "## Objective\n\nKeep canonical Markdown and SQLite aligned after accepted writes.\n",
          },
          source: {
            file_path: `vault/issues/${EXISTING_ISSUE.id}.md`,
            indexed_at: expect.any(String),
          },
        });
        expect(patchedCanonicalSource).toContain(
          "title: Projection stays aligned after patch",
        );
        expect(patchedCanonicalSource).toContain(`updated_at: ${PATCH_TIMESTAMP}`);
        expect(patchedCanonicalSource).toContain(
          "Keep canonical Markdown and SQLite aligned after accepted writes.",
        );
        expect(computeIssueRevision(patchedCanonicalSource)).toBe(patchedEnvelope.revision);
        expect(readIssueEnvelope(database, EXISTING_ISSUE.id)).toMatchObject({
          issue: patchedEnvelope.issue,
          derived: patchedEnvelope.derived,
          revision: patchedEnvelope.revision,
          source: {
            file_path: patchedEnvelope.source.file_path,
            indexed_at: expect.any(String),
          },
        });

        indexIssueEnvelope(database, STALE_PROJECTED_ISSUE);

        const staleBeforeRebuildResponse = await fetch(
          `${baseUrl}/issues/${STALE_PROJECTED_ISSUE.issue.id}`,
        );

        expect(staleBeforeRebuildResponse.status).toBe(200);

        const rebuildResponse = await fetch(`${baseUrl}/admin/rebuild-index`, {
          method: "POST",
        });

        expect(rebuildResponse.status).toBe(200);
        expect(await rebuildResponse.json()).toEqual({
          issue_count: 1,
          failure_count: 0,
          failures: [],
        });

        const rebuiltIssueResponse = await fetch(
          `${baseUrl}/issues/${EXISTING_ISSUE.id}`,
        );
        const staleAfterRebuildResponse = await fetch(
          `${baseUrl}/issues/${STALE_PROJECTED_ISSUE.issue.id}`,
        );

        expect(rebuiltIssueResponse.status).toBe(200);
        expect(await rebuiltIssueResponse.json()).toMatchObject({
          issue: patchedEnvelope.issue,
          derived: patchedEnvelope.derived,
          revision: patchedEnvelope.revision,
          source: {
            file_path: patchedEnvelope.source.file_path,
            indexed_at: expect.any(String),
          },
        });
        expect(staleAfterRebuildResponse.status).toBe(404);
        expect(readIssueEnvelope(database, EXISTING_ISSUE.id)).toMatchObject({
          issue: patchedEnvelope.issue,
          derived: patchedEnvelope.derived,
          revision: patchedEnvelope.revision,
          source: {
            file_path: patchedEnvelope.source.file_path,
            indexed_at: expect.any(String),
          },
        });
        expect(readIssueEnvelope(database, STALE_PROJECTED_ISSUE.issue.id)).toBeNull();
      },
    );
  } finally {
    database.close();
  }
});

test("renamed issues stay writable across post-persist rebuilds", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const databasePath = join(rootDirectory, ".mis", "index.sqlite");
  const database = openProjectionDatabase(databasePath);
  const store = new FilesystemIssueStore({ rootDirectory });
  const mutationLock = createFilesystemIssueMutationLock();
  const rebuildProjection = createFilesystemProjectionRebuilder({
    rootDirectory,
    databasePath,
  });

  await store.writeIssue(EXISTING_ISSUE);
  const canonicalFilePath = store.getIssueFilePath(EXISTING_ISSUE.id);
  const renamedFilePath = join(rootDirectory, "vault", "issues", "schema-foundation.md");
  await rename(canonicalFilePath, renamedFilePath);

  try {
    const startupResult = await scanIssueFilesIntoProjection({
      database,
      rootDirectory,
      indexedAt: STARTUP_INDEXED_AT,
    });
    const projectedAfterStartup = readIssueEnvelope(database, EXISTING_ISSUE.id);

    expect(startupResult.failures).toEqual([]);
    expect(projectedAfterStartup).toMatchObject({
      source: {
        file_path: "vault/issues/schema-foundation.md",
      },
    });

    await withServer(
      {
        adminHandlers: createFilesystemAdminRouteHandlers({
          rootDirectory,
          databasePath,
          mutationLock,
        }),
        mutationHandlers: {
          createIssue: () => new Response("unused", { status: 500 }),
          patchIssue: createPatchIssueHandler(
            createFilesystemPatchIssueMutationBoundary({
              rootDirectory,
              databasePath,
              now: () => PATCH_TIMESTAMP,
              afterPersist: rebuildProjection,
              mutationLock,
            }),
          ),
          transitionIssue: () => new Response("unused", { status: 500 }),
        },
        queryHandlers: createQueryHandlers(database),
      },
      async (baseUrl) => {
        const firstPatchResponse = await fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expectedRevision: projectedAfterStartup!.revision,
            title: "First renamed patch",
          }),
        });
        const firstPatchedEnvelope = await firstPatchResponse.json() as IssueEnvelope;

        expect(firstPatchResponse.status).toBe(200);
        expect(firstPatchedEnvelope.source.file_path).toBe(
          "vault/issues/schema-foundation.md",
        );
        expect(readIssueEnvelope(database, EXISTING_ISSUE.id)).toMatchObject({
          source: {
            file_path: "vault/issues/schema-foundation.md",
          },
        });

        const secondPatchResponse = await fetch(`${baseUrl}/issues/${EXISTING_ISSUE.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expectedRevision: firstPatchedEnvelope.revision,
            title: "Second renamed patch",
          }),
        });
        const secondPatchedEnvelope = await secondPatchResponse.json() as IssueEnvelope;

        expect(secondPatchResponse.status).toBe(200);
        expect(secondPatchedEnvelope.issue.title).toBe("Second renamed patch");
        expect(secondPatchedEnvelope.source.file_path).toBe(
          "vault/issues/schema-foundation.md",
        );
        expect(await readFile(renamedFilePath, "utf8")).toContain(
          "title: Second renamed patch",
        );
        await expect(readFile(canonicalFilePath, "utf8")).rejects.toThrow();
      },
    );
  } finally {
    database.close();
  }
});
