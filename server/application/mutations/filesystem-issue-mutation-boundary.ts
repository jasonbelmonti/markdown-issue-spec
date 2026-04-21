import { createFilesystemCreateIssueMutationBoundary } from "./filesystem-create-issue-mutation-boundary.ts";
import {
  createFilesystemIssueMutationLock,
  type FilesystemIssueMutationLock,
} from "./filesystem-issue-mutation-lock.ts";
import { createFilesystemPatchIssueMutationBoundary } from "./filesystem-patch-issue-mutation-boundary.ts";
import { createFilesystemTransitionIssueMutationBoundary } from "./filesystem-transition-issue-mutation-boundary.ts";
import { createFilesystemProjectionRebuilder } from "../../startup/filesystem-projection-rebuilder.ts";
import type { IssueMutationBoundary } from "./issue-mutation-boundary.ts";

export interface FilesystemIssueMutationBoundaryOptions {
  rootDirectory: string;
  databasePath?: string;
  mutationLock?: FilesystemIssueMutationLock;
  issueIdGenerator?: () => string;
  createNow?: () => string;
  patchNow?: () => string;
  transitionNow?: () => string;
}

export function createFilesystemIssueMutationBoundary(
  options: FilesystemIssueMutationBoundaryOptions,
): IssueMutationBoundary {
  const rebuildProjection = createFilesystemProjectionRebuilder({
    rootDirectory: options.rootDirectory,
    databasePath: options.databasePath,
  });
  const mutationLock =
    options.mutationLock ?? createFilesystemIssueMutationLock();

  return {
    createIssue: createFilesystemCreateIssueMutationBoundary({
      rootDirectory: options.rootDirectory,
      issueIdGenerator: options.issueIdGenerator,
      now: options.createNow,
      afterPersist: rebuildProjection,
      mutationLock,
    }).createIssue,
    patchIssue: createFilesystemPatchIssueMutationBoundary({
      rootDirectory: options.rootDirectory,
      databasePath: options.databasePath,
      now: options.patchNow,
      afterPersist: rebuildProjection,
      mutationLock,
    }).patchIssue,
    transitionIssue: createFilesystemTransitionIssueMutationBoundary({
      rootDirectory: options.rootDirectory,
      databasePath: options.databasePath,
      now: options.transitionNow,
      afterPersist: rebuildProjection,
      mutationLock,
    }).transitionIssue,
  };
}
