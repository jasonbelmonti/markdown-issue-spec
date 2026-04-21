import { expect, test } from "bun:test";
import { mkdtemp, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue, IssueEnvelope } from "../../core/types/index.ts";
import { indexIssueEnvelope, openProjectionDatabase } from "../../projection/index.ts";
import { computeIssueRevision } from "../../store/issue-revision.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import type { PatchIssueMutationCommand } from "./issue-mutation-boundary.ts";
import { createFilesystemPatchIssueMutationBoundary } from "./filesystem-patch-issue-mutation-boundary.ts";
import { PatchIssueValidationError } from "./patch-issue-validation-error.ts";

const PATCH_TIMESTAMP = "2026-04-16T19:45:00-05:00";

const PATCH_ISSUE_COMMAND = {
  kind: "patch_issue",
  issueId: "ISSUE-1234",
  input: {
    expectedRevision: "replace-me",
    title: "Updated title",
  },
} as const satisfies PatchIssueMutationCommand;

const EXISTING_ISSUE: Issue = {
  spec_version: "mis/0.1",
  id: PATCH_ISSUE_COMMAND.issueId,
  title: "Original title",
  kind: "task",
  status: "accepted",
  created_at: "2026-04-16T09:45:00-05:00",
  updated_at: "2026-04-16T09:45:00-05:00",
  body: "## Objective\n\nPatch this issue through the mutation boundary.\n",
};

async function createTemporaryRootDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-issue-patch-boundary-"));
}

function createPatchIssueBoundary(
  rootDirectory: string,
  options: Omit<
    Parameters<typeof createFilesystemPatchIssueMutationBoundary>[0],
    "rootDirectory"
  > = {},
) {
  return createFilesystemPatchIssueMutationBoundary({
    rootDirectory,
    ...options,
  });
}

async function indexProjectedIssue(
  rootDirectory: string,
  issue: Issue,
  filePath: string,
): Promise<void> {
  const database = openProjectionDatabase(join(rootDirectory, ".mis", "index.sqlite"));

  try {
    indexIssueEnvelope(database, createEnvelope(issue, filePath));
  } finally {
    database.close();
  }
}

async function writeCanonicalIssue(
  rootDirectory: string,
  issue: Issue = EXISTING_ISSUE,
): Promise<FilesystemIssueStore> {
  const store = new FilesystemIssueStore({ rootDirectory });

  await store.writeIssue(issue);
  await indexProjectedIssue(rootDirectory, issue, `vault/issues/${issue.id}.md`);

  return store;
}

async function readIssueSource(
  rootDirectory: string,
  issueId: string,
): Promise<string> {
  const store = new FilesystemIssueStore({ rootDirectory });

  return readFile(store.getIssueFilePath(issueId), "utf8");
}

function createEnvelope(issue: Issue, filePath: string): IssueEnvelope {
  return {
    issue,
    revision: "rev-issue-1234",
    source: {
      file_path: filePath,
      indexed_at: PATCH_TIMESTAMP,
    },
    derived: {
      children_ids: [],
      blocks_ids: [],
      blocked_by_ids: [],
      duplicates_ids: [],
      ready: true,
      is_blocked: false,
    },
  };
}

test("createFilesystemPatchIssueMutationBoundary restores the canonical file when post-persist rebuild fails", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createPatchIssueBoundary(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
    afterPersist: async () => {
      throw new Error("projection rebuild failed");
    },
  });

  await writeCanonicalIssue(rootDirectory);
  const originalSource = await readIssueSource(rootDirectory, EXISTING_ISSUE.id);
  const expectedRevision = computeIssueRevision(originalSource);

  await expect(
    boundary.patchIssue({
      ...PATCH_ISSUE_COMMAND,
      input: {
        ...PATCH_ISSUE_COMMAND.input,
        expectedRevision,
      },
    }),
  ).rejects.toThrow("projection rebuild failed");
  expect(await readIssueSource(rootDirectory, EXISTING_ISSUE.id)).toBe(originalSource);
});

test("createFilesystemPatchIssueMutationBoundary patches renamed issue files using the projected locator", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createPatchIssueBoundary(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });
  const store = await writeCanonicalIssue(rootDirectory);
  const canonicalFilePath = store.getIssueFilePath(EXISTING_ISSUE.id);
  const renamedFilePath = join(rootDirectory, "vault", "issues", "schema-foundation.md");
  await rename(canonicalFilePath, renamedFilePath);
  await indexProjectedIssue(
    rootDirectory,
    EXISTING_ISSUE,
    "vault/issues/schema-foundation.md",
  );

  const expectedRevision = computeIssueRevision(
    await readFile(renamedFilePath, "utf8"),
  );
  const result = await boundary.patchIssue({
    ...PATCH_ISSUE_COMMAND,
    input: {
      ...PATCH_ISSUE_COMMAND.input,
      expectedRevision,
    },
  });

  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error("Expected patch mutation to apply.");
  }

  expect(result.envelope.source.file_path).toBe("vault/issues/schema-foundation.md");
  expect(await readFile(renamedFilePath, "utf8")).toContain("title: Updated title");
  await expect(readFile(canonicalFilePath, "utf8")).rejects.toThrow();
});

test("createFilesystemPatchIssueMutationBoundary rejects unsafe issue ids as request validation errors", async () => {
  const rootDirectory = await createTemporaryRootDirectory();
  const boundary = createPatchIssueBoundary(rootDirectory, {
    now: () => PATCH_TIMESTAMP,
  });

  await expect(
    boundary.patchIssue({
      ...PATCH_ISSUE_COMMAND,
      issueId: "../ISSUE-1234",
      input: {
        ...PATCH_ISSUE_COMMAND.input,
        expectedRevision: "stale-revision",
      },
    }),
  ).rejects.toEqual(
    expect.objectContaining<Partial<PatchIssueValidationError>>({
      name: "PatchIssueValidationError",
      errors: [
        expect.objectContaining({
          code: "patch.invalid_issue_id",
          path: "/id",
          source: "request",
          details: {
            issueId: "../ISSUE-1234",
          },
        }),
      ],
    }),
  );
});
