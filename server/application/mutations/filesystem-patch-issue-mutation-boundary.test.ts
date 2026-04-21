import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Issue } from "../../core/types/index.ts";
import { computeIssueRevision } from "../../store/issue-revision.ts";
import { FilesystemIssueStore } from "../../store/index.ts";
import type { PatchIssueMutationCommand } from "./issue-mutation-boundary.ts";
import { createFilesystemPatchIssueMutationBoundary } from "./filesystem-patch-issue-mutation-boundary.ts";

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
