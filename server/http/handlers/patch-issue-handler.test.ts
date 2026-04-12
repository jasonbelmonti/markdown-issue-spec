import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFilesystemPatchIssueMutationBoundary } from "../../application/mutations/filesystem-patch-issue-mutation-boundary.ts";
import type { Issue } from "../../core/types/index.ts";
import { computeIssueRevision } from "../../store/issue-revision.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import { createPatchIssueHandler } from "./patch-issue-handler.ts";
import type { HttpRouteRequest } from "./types.ts";

const PATCH_TIMESTAMP = "2026-04-12T12:34:00-05:00";

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: "ISSUE-1234",
  title: "Implement patch issue mutation",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-12T09:45:00-05:00",
  updated_at: "2026-04-12T09:45:00-05:00",
  summary: "Current summary",
  priority: "P2",
  labels: ["api", "mutation"],
  assignees: ["jason"],
  extensions: {
    "acme/source": "seed",
  },
  body: "## Objective\n\nPatch me through the mutation boundary.\n",
};

function createPatchIssueRequest(
  body: unknown,
  issueId = EXISTING_ISSUE.id,
): Request {
  return new Request(`http://localhost/issues/${encodeURIComponent(issueId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-patch-handler-"));
}

function createRealPatchIssueHandler(
  rootDirectory: string,
  options: Omit<
    Parameters<typeof createFilesystemPatchIssueMutationBoundary>[0],
    "rootDirectory"
  > = {},
) {
  return createPatchIssueHandler(
    createFilesystemPatchIssueMutationBoundary({
      rootDirectory,
      ...options,
    }),
  );
}

function createUnexpectedPatchIssueBoundary() {
  return {
    async patchIssue() {
      throw new Error("patchIssue should not be called for invalid requests.");
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

test("createPatchIssueHandler delegates to the mutation boundary with the issue id and parsed input", async () => {
  const commands: unknown[] = [];
  const requestBody = {
    expectedRevision: "revision-1",
    title: "Updated title",
  };
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

  const response = await handler(createPatchIssueRequest(requestBody));

  expect(commands).toEqual([
    {
      kind: "patch_issue",
      issueId: EXISTING_ISSUE.id,
      input: requestBody,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createPatchIssueHandler prefers the decoded route param for issue ids", async () => {
  const commands: unknown[] = [];
  const requestBody = {
    expectedRevision: "revision-1",
  };
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
    createPatchIssueRequest(requestBody, "ID/123"),
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
      input: requestBody,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createPatchIssueHandler falls back to the raw path segment when percent decoding fails", async () => {
  const commands: unknown[] = [];
  const requestBody = {
    expectedRevision: "revision-1",
  };
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
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );

  expect(commands).toEqual([
    {
      kind: "patch_issue",
      issueId: "%E0%A4%A",
      input: requestBody,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createPatchIssueHandler returns deterministic JSON parse errors before delegation", async () => {
  const handler = createPatchIssueHandler(createUnexpectedPatchIssueBoundary());

  const response = await handler(
    new Request("http://localhost/issues/ISSUE-1234", {
      method: "PATCH",
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

test("createPatchIssueHandler returns deterministic empty body errors before delegation", async () => {
  const handler = createPatchIssueHandler(createUnexpectedPatchIssueBoundary());

  const response = await handler(
    new Request("http://localhost/issues/ISSUE-1234", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: {
      code: "invalid_json_body",
      message: "Request body must not be empty.",
    },
  });
});

test("createPatchIssueHandler returns deterministic unsupported media type errors before delegation", async () => {
  const handler = createPatchIssueHandler(createUnexpectedPatchIssueBoundary());

  const response = await handler(
    new Request("http://localhost/issues/ISSUE-1234", {
      method: "PATCH",
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

test("createPatchIssueHandler maps invalid issue ids to deterministic validation errors", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  const response = await handler(
    Object.assign(
      createPatchIssueRequest(
        {
          expectedRevision: "revision-1",
          title: "Should not write",
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
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "patch.invalid_issue_id",
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

test("createPatchIssueHandler maps revision mismatches to deterministic 409 responses", async () => {
  const handler = createPatchIssueHandler({
    async patchIssue() {
      return {
        status: "revision_mismatch",
        issueId: EXISTING_ISSUE.id,
        expectedRevision: "revision-1",
        currentRevision: "revision-2",
      } as const;
    },
  });

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision: "revision-1",
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

test("createPatchIssueHandler returns 200 with a persisted updated issue envelope", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      title: "Implement real patch issue mutation",
      summary: "Updated summary",
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
      title: "Implement real patch issue mutation",
      summary: "Updated summary",
      updated_at: PATCH_TIMESTAMP,
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
      indexed_at: PATCH_TIMESTAMP,
    },
  });
  expect(responseBody.revision).not.toBe(expectedRevision);
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual(responseBody.issue);
});

test("createPatchIssueHandler replaces provided top-level arrays and objects without deep merging", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);

  await store.writeIssue({
    spec_version: "mis/0.1",
    id: "ISSUE-0002",
    title: "Existing dependency target",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-12T10:15:00-05:00",
    body: "## Objective\n\nBe a valid dependency target.\n",
  });

  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      labels: ["server", "patch"],
      assignees: ["octavia"],
      links: [
        {
          rel: "depends_on",
          target: "ISSUE-0002",
          required_before: "completed",
        },
      ],
      extensions: {
        "acme/source": "patched",
        "acme/rollout": "m3",
      },
    }),
  );

  expect(response.status).toBe(200);
  expect(await store.readIssue(EXISTING_ISSUE.id)).toEqual({
    ...EXISTING_ISSUE,
    updated_at: PATCH_TIMESTAMP,
    labels: ["server", "patch"],
    assignees: ["octavia"],
    links: [
      {
        rel: "depends_on",
        target: {
          id: "ISSUE-0002",
        },
        required_before: "completed",
      },
    ],
    extensions: {
      "acme/source": "patched",
      "acme/rollout": "m3",
    },
  });
});

test("createPatchIssueHandler rejects stale revisions without modifying the canonical file", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision: "stale-revision",
      title: "This write should be rejected",
    }),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: {
      code: "revision_mismatch",
      message: "The issue revision does not match the expected revision.",
      details: {
        issueId: EXISTING_ISSUE.id,
        expectedRevision: "stale-revision",
        currentRevision: computeIssueRevision(originalSource),
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler rejects immutable fields with deterministic validation errors and no write", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      id: "ISSUE-9999",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "patch.immutable_field",
            source: "request",
            path: "/id",
            message: "Patch requests must not include `id`.",
            details: {
              field: "id",
            },
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler rejects unknown patch fields with deterministic validation errors and no write", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      titel: "Typo should not be ignored",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "patch.unknown_field",
            source: "request",
            path: "/titel",
            message: "Patch requests must not include unknown field `titel`.",
            details: {
              field: "titel",
            },
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler rejects request bodies that do not change any mutable fields", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "patch.no_changes_requested",
            source: "request",
            path: "/",
            message:
              "Patch requests must include at least one mutable field in addition to `expectedRevision`.",
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler rejects resolution-only patches when the issue remains non-terminal", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      resolution: "duplicate",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "patch.non_terminal_resolution",
            source: "request",
            path: "/resolution",
            message:
              "Patch requests must not include `resolution` when the issue status remains `accepted`.",
            details: {
              status: "accepted",
            },
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler returns deterministic schema validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      title: "",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "schema.min_length",
            source: "schema",
            path: "/title",
            message: "Expected `title` to be a non-empty string.",
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler returns deterministic semantic validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      links: [
        {
          rel: "duplicate_of",
          target: EXISTING_ISSUE.id,
        },
      ],
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "semantic.self_link",
            source: "semantic",
            path: "/links/0/target/id",
            message: "Issue links must not target the source issue itself.",
            details: {
              issueId: EXISTING_ISSUE.id,
              rel: "duplicate_of",
              targetIssueId: EXISTING_ISSUE.id,
            },
            related_issue_ids: [EXISTING_ISSUE.id],
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler returns deterministic graph validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);

  await store.writeIssue({
    spec_version: "mis/0.1",
    id: "ISSUE-0200",
    title: "Existing parent dependency",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-12T10:00:00-05:00",
    links: [
      {
        rel: "parent",
        target: {
          id: EXISTING_ISSUE.id,
        },
      },
    ],
    body: "## Objective\n\nParticipate in a parent cycle.\n",
  });

  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);
  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      links: [
        {
          rel: "parent",
          target: "ISSUE-0200",
        },
      ],
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "graph.parent_cycle",
            severity: "error",
            message: "Parent graph contains a cycle.",
            issue_id: EXISTING_ISSUE.id,
            file_path: `vault/issues/${EXISTING_ISSUE.id}.md`,
            related_issue_ids: ["ISSUE-0200"],
          },
        ],
      },
    },
  });
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createPatchIssueHandler ignores unrelated unreadable canonical files during graph validation", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);
  const issueDirectory = join(rootDirectory, "vault", "issues");
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  await writeFile(
    join(issueDirectory, "ISSUE-BROKEN.md"),
    `---
spec_version: mis/0.1
id: ISSUE-BROKEN
title: Broken canonical issue
kind: task
status: accepted
created_at: definitely-not-a-timestamp
---
`,
  );

  const response = await handler(
    createPatchIssueRequest({
      expectedRevision,
      summary: "Patched despite unrelated broken files",
    }),
  );

  expect(response.status).toBe(200);
  expect((await store.readIssue(EXISTING_ISSUE.id)).summary).toBe(
    "Patched despite unrelated broken files",
  );
});

test("createPatchIssueHandler maps missing canonical issues to 404 responses", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  const response = await handler(
    createPatchIssueRequest(
      {
        expectedRevision: "missing-revision",
        title: "This issue does not exist",
      },
      "ISSUE-404",
    ),
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_not_found",
      message: "The requested issue was not found.",
      details: {
        issueId: "ISSUE-404",
      },
    },
  });
});

test("createPatchIssueHandler rejects the second concurrent write for the same expected revision", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  let releaseFirstPersist!: () => void;
  const firstPersistReached = new Promise<void>((resolve) => {
    releaseFirstPersist = resolve;
  });
  let beforePersistCallCount = 0;
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
    beforePersist: async () => {
      beforePersistCallCount += 1;

      if (beforePersistCallCount === 1) {
        await firstPersistReached;
      }
    },
  });

  await writeCanonicalIssue(rootDirectory);
  const expectedRevision = await readIssueRevision(rootDirectory, EXISTING_ISSUE.id);

  const firstResponsePromise = handler(
    createPatchIssueRequest({
      expectedRevision,
      title: "First concurrent write",
    }),
  );

  await Promise.resolve();
  await Promise.resolve();

  const secondResponsePromise = handler(
    createPatchIssueRequest({
      expectedRevision,
      summary: "Second concurrent write",
    }),
  );

  releaseFirstPersist();

  const [firstResponse, secondResponse] = await Promise.all([
    firstResponsePromise,
    secondResponsePromise,
  ]);

  expect(firstResponse.status).toBe(200);
  expect(await secondResponse.json()).toEqual({
    error: {
      code: "revision_mismatch",
      message: "The issue revision does not match the expected revision.",
      details: {
        issueId: EXISTING_ISSUE.id,
        expectedRevision,
        currentRevision: expect.any(String),
      },
    },
  });
  expect(secondResponse.status).toBe(409);
  expect((await firstResponse.json()).issue.title).toBe("First concurrent write");
  expect((await readIssueSource(rootDirectory, EXISTING_ISSUE.id))).toContain(
    "First concurrent write",
  );
});

test("createPatchIssueHandler serializes concurrent graph-validating writes across issues", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  let releaseFirstPersist!: () => void;
  const firstPersistReached = new Promise<void>((resolve) => {
    releaseFirstPersist = resolve;
  });
  let beforePersistCallCount = 0;
  const handler = createRealPatchIssueHandler(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
    beforePersist: async () => {
      beforePersistCallCount += 1;

      if (beforePersistCallCount === 1) {
        await firstPersistReached;
      }
    },
  });
  const store = await writeCanonicalIssue(rootDirectory, {
    ...EXISTING_ISSUE,
    id: "ISSUE-1000",
    title: "Left side of the graph race",
  });

  await store.writeIssue({
    ...EXISTING_ISSUE,
    id: "ISSUE-2000",
    title: "Right side of the graph race",
  });

  const leftRevision = await readIssueRevision(rootDirectory, "ISSUE-1000");
  const rightRevision = await readIssueRevision(rootDirectory, "ISSUE-2000");

  const firstResponsePromise = handler(
    createPatchIssueRequest(
      {
        expectedRevision: leftRevision,
        links: [
          {
            rel: "parent",
            target: "ISSUE-2000",
          },
        ],
      },
      "ISSUE-1000",
    ),
  );

  await Promise.resolve();
  await Promise.resolve();

  const secondResponsePromise = handler(
    createPatchIssueRequest(
      {
        expectedRevision: rightRevision,
        links: [
          {
            rel: "parent",
            target: "ISSUE-1000",
          },
        ],
      },
      "ISSUE-2000",
    ),
  );

  releaseFirstPersist();

  const [firstResponse, secondResponse] = await Promise.all([
    firstResponsePromise,
    secondResponsePromise,
  ]);

  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(422);
  expect(await secondResponse.json()).toEqual({
    error: {
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: [
          {
            code: "graph.parent_cycle",
            severity: "error",
            message: "Parent graph contains a cycle.",
            issue_id: "ISSUE-2000",
            file_path: "vault/issues/ISSUE-2000.md",
            related_issue_ids: ["ISSUE-1000"],
          },
        ],
      },
    },
  });
});
