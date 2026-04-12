import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CREATE_ISSUE_BODY } from "../../application/mutations/create-issue-default-body.ts";
import { createFilesystemCreateIssueMutationBoundary } from "../../application/mutations/filesystem-create-issue-mutation-boundary.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import { createCreateIssueHandler } from "./create-issue-handler.ts";
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

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-create-handler-"));
}

function createRealCreateIssueHandler(
  rootDirectory: string,
  options: Omit<
    Parameters<typeof createFilesystemCreateIssueMutationBoundary>[0],
    "rootDirectory"
  > = {},
) {
  return createCreateIssueHandler(
    createFilesystemCreateIssueMutationBoundary({
      rootDirectory,
      ...options,
    }),
  );
}

function createUnexpectedCreateIssueBoundary() {
  return {
    async createIssue() {
      throw new Error("createIssue should not be called for invalid requests.");
    },
  };
}

test("createCreateIssueHandler returns 201 with a persisted issue envelope", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealCreateIssueHandler(rootDirectory);
  const store = new FilesystemIssueStore({ rootDirectory });

  const response = await handler(createCreateIssueRequest());
  const responseBody = await response.json() as {
    issue: { id: string };
    source: { file_path: string; indexed_at: string };
    revision: string;
  };

  expect(response.status).toBe(201);
  expect(responseBody.issue.id).toMatch(/^ISSUE-[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(responseBody).toMatchObject({
    issue: {
      spec_version: "mis/0.1",
      title: CREATE_ISSUE_REQUEST_BODY.title,
      kind: CREATE_ISSUE_REQUEST_BODY.kind,
      status: CREATE_ISSUE_REQUEST_BODY.status,
      created_at: CREATE_ISSUE_REQUEST_BODY.created_at,
      labels: CREATE_ISSUE_REQUEST_BODY.labels,
      body: CREATE_ISSUE_REQUEST_BODY.body,
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
      file_path: `vault/issues/${responseBody.issue.id}.md`,
      indexed_at: expect.any(String),
    },
  });
  expect((await store.readIssue(responseBody.issue.id)).id).toBe(
    responseBody.issue.id,
  );
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

test("createCreateIssueHandler writes the default body template when body is omitted", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealCreateIssueHandler(rootDirectory);
  const store = new FilesystemIssueStore({ rootDirectory });
  const requestBody = {
    ...CREATE_ISSUE_REQUEST_BODY,
  };

  delete (requestBody as { body?: string }).body;

  const response = await handler(createCreateIssueRequest(requestBody));
  const responseBody = await response.json() as {
    issue: { id: string };
  };

  expect(response.status).toBe(201);
  expect((await store.readIssue(responseBody.issue.id)).body).toBe(
    DEFAULT_CREATE_ISSUE_BODY,
  );
});

test("createCreateIssueHandler ignores client-supplied ids and persists the server-owned id", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealCreateIssueHandler(rootDirectory);
  const clientIssueId = "ISSUE-CLIENT-SUPPLIED";

  const response = await handler(
    createCreateIssueRequest({
      ...CREATE_ISSUE_REQUEST_BODY,
      id: clientIssueId,
    }),
  );
  const responseBody = await response.json() as {
    issue: { id: string };
  };

  expect(response.status).toBe(201);
  expect(responseBody.issue.id).not.toBe(clientIssueId);
  expect(await readdir(join(rootDirectory, "vault", "issues"))).not.toContain(
    `${clientIssueId}.md`,
  );
});

test("createCreateIssueHandler returns deterministic schema validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealCreateIssueHandler(rootDirectory);

  const response = await handler(
    createCreateIssueRequest({
      ...CREATE_ISSUE_REQUEST_BODY,
      spec_version: "mis/9.9",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_create_validation_failed",
      message: "Issue create validation failed.",
      details: {
        errors: [
          {
            code: "schema.const",
            source: "schema",
            path: "/spec_version",
            message: "Unsupported issue spec version: mis/9.9",
            details: {
              keyword: "const",
              schemaPath: "#/properties/spec_version/const",
              allowedValue: "mis/0.1",
              actualValue: "mis/9.9",
            },
          },
        ],
      },
    },
  });
  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("createCreateIssueHandler ignores unrelated invalid canonical files when validating the new issue graph", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const issueDirectory = join(rootDirectory, "vault", "issues");
  const handler = createRealCreateIssueHandler(rootDirectory);

  await Bun.$`mkdir -p ${issueDirectory}`.quiet();
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

  const response = await handler(createCreateIssueRequest());
  const responseBody = await response.json() as {
    issue: { id: string };
  };

  expect(response.status).toBe(201);
  expect(responseBody.issue.id).toMatch(/^ISSUE-[0-9A-HJKMNP-TV-Z]{26}$/);
});

test("createCreateIssueHandler returns deterministic semantic validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const generatedIssueId = "ISSUE-00000000000000000000000003";
  const handler = createRealCreateIssueHandler(rootDirectory, {
    issueIdGenerator: () => generatedIssueId,
  });

  const response = await handler(
    createCreateIssueRequest({
      ...CREATE_ISSUE_REQUEST_BODY,
      links: [
        {
          rel: "duplicate_of",
          target: generatedIssueId,
        },
      ],
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_create_validation_failed",
      message: "Issue create validation failed.",
      details: {
        errors: [
          {
            code: "semantic.self_link",
            source: "semantic",
            path: "/links/0/target/id",
            message: "Issue links must not target the source issue itself.",
            details: {
              issueId: generatedIssueId,
              rel: "duplicate_of",
              targetIssueId: generatedIssueId,
            },
            related_issue_ids: [generatedIssueId],
          },
        ],
      },
    },
  });
  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("createCreateIssueHandler returns deterministic unresolved-reference failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const generatedIssueId = "ISSUE-00000000000000000000000001";
  const handler = createRealCreateIssueHandler(rootDirectory, {
    issueIdGenerator: () => generatedIssueId,
  });

  const response = await handler(
    createCreateIssueRequest({
      ...CREATE_ISSUE_REQUEST_BODY,
      links: [
        {
          rel: "references",
          target: "ISSUE-404",
        },
      ],
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_create_validation_failed",
      message: "Issue create validation failed.",
      details: {
        errors: [
          {
            code: "graph.unresolved_reference",
            severity: "error",
            message: "Issue references a target that was not found in the current graph.",
            issue_id: generatedIssueId,
            file_path: `vault/issues/${generatedIssueId}.md`,
            field_path: "links[0].target",
            related_issue_ids: ["ISSUE-404"],
          },
        ],
      },
    },
  });
  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("createCreateIssueHandler returns deterministic graph cycle failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const generatedIssueId = "ISSUE-00000000000000000000000002";
  const store = new FilesystemIssueStore({ rootDirectory });
  const handler = createRealCreateIssueHandler(rootDirectory, {
    issueIdGenerator: () => generatedIssueId,
  });

  await store.writeIssue({
    spec_version: "mis/0.1",
    id: "ISSUE-0100",
    title: "Existing issue in the parent graph",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-11T10:00:00-05:00",
    links: [
      {
        rel: "parent",
        target: {
          id: generatedIssueId,
        },
      },
    ],
    body: "## Objective\n\nParticipate in a cycle.",
  });

  const response = await handler(
    createCreateIssueRequest({
      ...CREATE_ISSUE_REQUEST_BODY,
      links: [
        {
          rel: "parent",
          target: "ISSUE-0100",
        },
      ],
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_create_validation_failed",
      message: "Issue create validation failed.",
      details: {
        errors: [
          {
            code: "graph.parent_cycle",
            severity: "error",
            message: "Parent graph contains a cycle.",
            issue_id: generatedIssueId,
            file_path: `vault/issues/${generatedIssueId}.md`,
            related_issue_ids: ["ISSUE-0100"],
          },
        ],
      },
    },
  });
  expect(await readdir(join(rootDirectory, "vault", "issues"))).toEqual([
    "ISSUE-0100.md",
  ]);
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
