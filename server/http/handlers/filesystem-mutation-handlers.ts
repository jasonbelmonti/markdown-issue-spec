import {
  createFilesystemIssueMutationBoundary,
  type FilesystemIssueMutationBoundaryOptions,
} from "../../application/mutations/filesystem-issue-mutation-boundary.ts";
import { createCreateIssueHandler } from "./create-issue-handler.ts";
import { createPatchIssueHandler } from "./patch-issue-handler.ts";
import { createTransitionIssueHandler } from "./transition-issue-handler.ts";
import type { MutationRouteHandlers } from "./types.ts";

export type FilesystemMutationRouteHandlersOptions =
  FilesystemIssueMutationBoundaryOptions;

export function createFilesystemMutationRouteHandlers(
  options: FilesystemMutationRouteHandlersOptions,
): MutationRouteHandlers {
  const issueMutationBoundary = createFilesystemIssueMutationBoundary(options);

  return {
    createIssue: createCreateIssueHandler(issueMutationBoundary),
    patchIssue: createPatchIssueHandler(issueMutationBoundary),
    transitionIssue: createTransitionIssueHandler(issueMutationBoundary),
  };
}
