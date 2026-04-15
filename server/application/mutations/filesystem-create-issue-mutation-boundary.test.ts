import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FilesystemIssueStore } from "../../store/index.ts";
import type { CreateIssueMutationCommand } from "./issue-mutation-boundary.ts";
import { DEFAULT_CREATE_ISSUE_BODY } from "./create-issue-default-body.ts";
import { CreateIssueValidationError } from "./create-issue-validation-error.ts";
import { createFilesystemCreateIssueMutationBoundary } from "./filesystem-create-issue-mutation-boundary.ts";

const CREATE_TIMESTAMP = "2026-04-15T12:34:00-05:00";
const CREATE_ISSUE_COMMAND = {
  kind: "create_issue",
  input: {
    spec_version: "mis/0.1",
    title: "Implement create issue mutation",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-15T09:45:00-05:00",
    labels: ["api", "mutation"],
    body: "## Objective\n\nPersist a valid create command.\n",
  },
} as const satisfies CreateIssueMutationCommand;

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-create-boundary-"));
}

function createCreateIssueBoundary(
  rootDirectory: string,
  options: Omit<
    Parameters<typeof createFilesystemCreateIssueMutationBoundary>[0],
    "rootDirectory"
  > = {},
) {
  return createFilesystemCreateIssueMutationBoundary({
    rootDirectory,
    ...options,
  });
}

async function expectCreateValidationError(
  run: Promise<unknown>,
): Promise<CreateIssueValidationError> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(CreateIssueValidationError);

    return error as CreateIssueValidationError;
  }

  throw new Error("Expected create mutation to reject with CreateIssueValidationError.");
}

test("createFilesystemCreateIssueMutationBoundary applies valid create commands and persists the canonical issue", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createCreateIssueBoundary(rootDirectory, {
    now: () => CREATE_TIMESTAMP,
  });
  const store = new FilesystemIssueStore({ rootDirectory });

  const result = await boundary.createIssue(CREATE_ISSUE_COMMAND);

  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error("Expected create mutation to apply.");
  }

  expect(result.issue.id).toMatch(/^ISSUE-[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(result).toMatchObject({
    issue: {
      spec_version: "mis/0.1",
      title: CREATE_ISSUE_COMMAND.input.title,
      kind: CREATE_ISSUE_COMMAND.input.kind,
      status: CREATE_ISSUE_COMMAND.input.status,
      created_at: CREATE_ISSUE_COMMAND.input.created_at,
      labels: CREATE_ISSUE_COMMAND.input.labels,
      body: CREATE_ISSUE_COMMAND.input.body,
    },
    envelope: {
      issue: {
        id: result.issue.id,
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
        file_path: `vault/issues/${result.issue.id}.md`,
        indexed_at: CREATE_TIMESTAMP,
      },
    },
    revision: expect.any(String),
  });
  expect(await store.readIssue(result.issue.id)).toEqual(result.issue);
});

test("createFilesystemCreateIssueMutationBoundary writes the default body template when body is omitted", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createCreateIssueBoundary(rootDirectory, {
    issueIdGenerator: () => "ISSUE-00000000000000000000000009",
  });
  const store = new FilesystemIssueStore({ rootDirectory });
  const input = { ...CREATE_ISSUE_COMMAND.input };

  delete (input as { body?: string }).body;

  const result = await boundary.createIssue({
    kind: "create_issue",
    input,
  });

  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error("Expected create mutation to apply.");
  }

  expect((await store.readIssue(result.issue.id)).body).toBe(DEFAULT_CREATE_ISSUE_BODY);
});

test("createFilesystemCreateIssueMutationBoundary ignores client-supplied ids and persists the server-owned id", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createCreateIssueBoundary(rootDirectory, {
    issueIdGenerator: () => "ISSUE-00000000000000000000000010",
  });
  const clientIssueId = "ISSUE-CLIENT-SUPPLIED";

  const result = await boundary.createIssue({
    kind: "create_issue",
    input: {
      ...CREATE_ISSUE_COMMAND.input,
      id: clientIssueId,
    } as typeof CREATE_ISSUE_COMMAND.input,
  });

  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error("Expected create mutation to apply.");
  }

  expect(result.issue.id).toBe("ISSUE-00000000000000000000000010");
  expect(result.issue.id).not.toBe(clientIssueId);
  expect(await readdir(join(rootDirectory, "vault", "issues"))).not.toContain(
    `${clientIssueId}.md`,
  );
});

test("createFilesystemCreateIssueMutationBoundary rejects schema validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createCreateIssueBoundary(rootDirectory);

  const error = await expectCreateValidationError(
    boundary.createIssue({
      kind: "create_issue",
      input: {
        ...CREATE_ISSUE_COMMAND.input,
        spec_version: "mis/9.9",
      } as typeof CREATE_ISSUE_COMMAND.input,
    }),
  );

  expect(error.errors).toEqual([
    {
      code: "schema.const",
      source: "schema",
      path: "/spec_version",
      message: "Unsupported issue spec version: undefined",
      details: {
        keyword: "const",
        schemaPath: "#/properties/spec_version/const",
        allowedValue: "mis/0.1",
      },
    },
  ]);
  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("createFilesystemCreateIssueMutationBoundary rejects semantic validation failures without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const generatedIssueId = "ISSUE-00000000000000000000000003";
  const boundary = createCreateIssueBoundary(rootDirectory, {
    issueIdGenerator: () => generatedIssueId,
  });

  const error = await expectCreateValidationError(
    boundary.createIssue({
      kind: "create_issue",
      input: {
        ...CREATE_ISSUE_COMMAND.input,
        links: [
          {
            rel: "duplicate_of",
            target: generatedIssueId,
          },
        ],
      },
    }),
  );

  expect(error.errors).toEqual([
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
  ]);
  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("createFilesystemCreateIssueMutationBoundary ignores unrelated invalid canonical files when validating a new issue graph", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createCreateIssueBoundary(rootDirectory);
  const store = new FilesystemIssueStore({ rootDirectory });

  await Bun.write(
    join(rootDirectory, "vault", "issues", "ISSUE-BROKEN.md"),
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

  const result = await boundary.createIssue(CREATE_ISSUE_COMMAND);

  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error("Expected create mutation to apply.");
  }

  expect((await store.readIssue(result.issue.id)).id).toBe(result.issue.id);
});

test("createFilesystemCreateIssueMutationBoundary rejects unresolved references without writing files", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const generatedIssueId = "ISSUE-00000000000000000000000001";
  const boundary = createCreateIssueBoundary(rootDirectory, {
    issueIdGenerator: () => generatedIssueId,
  });

  const error = await expectCreateValidationError(
    boundary.createIssue({
      kind: "create_issue",
      input: {
        ...CREATE_ISSUE_COMMAND.input,
        links: [
          {
            rel: "references",
            target: "ISSUE-404",
          },
        ],
      },
    }),
  );

  expect(error.errors).toEqual([
    {
      code: "graph.unresolved_reference",
      severity: "error",
      message: "Issue references a target that was not found in the current graph.",
      issue_id: generatedIssueId,
      file_path: `vault/issues/${generatedIssueId}.md`,
      field_path: "links[0].target",
      related_issue_ids: ["ISSUE-404"],
    },
  ]);
  await expect(readdir(join(rootDirectory, "vault", "issues"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("createFilesystemCreateIssueMutationBoundary rejects graph validation failures without writing a new file", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const generatedIssueId = "ISSUE-00000000000000000000000002";
  const store = new FilesystemIssueStore({ rootDirectory });
  const boundary = createCreateIssueBoundary(rootDirectory, {
    issueIdGenerator: () => generatedIssueId,
  });

  await store.writeIssue({
    spec_version: "mis/0.1",
    id: "ISSUE-0100",
    title: "Existing issue in the parent graph",
    kind: "task",
    status: "accepted",
    created_at: "2026-04-14T10:00:00-05:00",
    links: [
      {
        rel: "parent",
        target: {
          id: generatedIssueId,
        },
      },
    ],
    body: "## Objective\n\nParticipate in a cycle.\n",
  });

  const error = await expectCreateValidationError(
    boundary.createIssue({
      kind: "create_issue",
      input: {
        ...CREATE_ISSUE_COMMAND.input,
        links: [
          {
            rel: "parent",
            target: "ISSUE-0100",
          },
        ],
      },
    }),
  );

  expect(error.errors).toEqual([
    {
      code: "graph.parent_cycle",
      severity: "error",
      message: "Parent graph contains a cycle.",
      issue_id: generatedIssueId,
      file_path: `vault/issues/${generatedIssueId}.md`,
      related_issue_ids: ["ISSUE-0100"],
    },
  ]);
  expect(await readdir(join(rootDirectory, "vault", "issues"))).toEqual([
    "ISSUE-0100.md",
  ]);
});
