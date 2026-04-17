import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CreateIssueValidationError } from "../../application/mutations/create-issue-validation-error.ts";
import { createFilesystemCreateIssueMutationBoundary } from "../../application/mutations/filesystem-create-issue-mutation-boundary.ts";
import type { CreateIssueMutationCommand } from "../../application/mutations/issue-mutation-boundary.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import { createCreateIssueHandler } from "./create-issue-handler.ts";

const CREATE_TIMESTAMP = "2026-04-16T20:59:00-05:00";
const CREATED_ISSUE_ID = "ISSUE-00000000000000000000000011";
const CREATE_ISSUE_INPUT = {
  spec_version: "mis/0.1",
  title: "Wire create issue handler",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-16T18:45:00-05:00",
  labels: ["api", "mutation"],
  body: "## Objective\n\nExpose the real create mutation boundary.\n",
} as const satisfies CreateIssueMutationCommand["input"];

function createCreateIssueRequest(
  body: unknown = CREATE_ISSUE_INPUT,
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

function createUnexpectedCreateIssueMutationBoundary() {
  return {
    async createIssue() {
      throw new Error("createIssue should not be called for invalid requests.");
    },
  };
}

test("createCreateIssueHandler delegates to the mutation boundary with parsed input", async () => {
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
      input: CREATE_ISSUE_INPUT,
    },
  ]);
  expect(response.status).toBe(501);
});

test("createCreateIssueHandler returns 201 with the created issue envelope", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const handler = createRealCreateIssueHandler(rootDirectory, {
    issueIdGenerator: () => CREATED_ISSUE_ID,
    now: () => CREATE_TIMESTAMP,
  });
  const store = new FilesystemIssueStore({ rootDirectory });

  const response = await handler(createCreateIssueRequest());

  expect(response.status).toBe(201);

  const envelope = await response.json();

  expect(envelope).toMatchObject({
    issue: {
      id: CREATED_ISSUE_ID,
      spec_version: CREATE_ISSUE_INPUT.spec_version,
      title: CREATE_ISSUE_INPUT.title,
      kind: CREATE_ISSUE_INPUT.kind,
      status: CREATE_ISSUE_INPUT.status,
      created_at: CREATE_ISSUE_INPUT.created_at,
      labels: CREATE_ISSUE_INPUT.labels,
      body: CREATE_ISSUE_INPUT.body,
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
      file_path: `vault/issues/${CREATED_ISSUE_ID}.md`,
      indexed_at: CREATE_TIMESTAMP,
    },
  });
  expect(await store.readIssue(CREATED_ISSUE_ID)).toEqual(envelope.issue);
});

test("createCreateIssueHandler returns 422 with create validation details", async () => {
  const handler = createCreateIssueHandler({
    async createIssue() {
      throw new CreateIssueValidationError([
        {
          code: "create.invalid_payload",
          source: "request",
          path: "/",
          message: "Create issue input must be a JSON object.",
        },
      ]);
    },
  });

  const response = await handler(createCreateIssueRequest());

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_create_validation_failed",
      message: "Issue create validation failed.",
      details: {
        errors: [
          {
            code: "create.invalid_payload",
            source: "request",
            path: "/",
            message: "Create issue input must be a JSON object.",
          },
        ],
      },
    },
  });
});

test("createCreateIssueHandler returns deterministic JSON parse errors before delegation", async () => {
  const handler = createCreateIssueHandler(
    createUnexpectedCreateIssueMutationBoundary(),
  );

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
  const handler = createCreateIssueHandler(
    createUnexpectedCreateIssueMutationBoundary(),
  );

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
