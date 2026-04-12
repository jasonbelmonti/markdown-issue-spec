import { handleCreateIssue } from "./create-issue-handler.ts";
import { handlePatchIssue } from "./patch-issue-handler.ts";
import { handleTransitionIssue } from "./transition-issue-handler.ts";
import type { MutationRouteHandlers } from "./types.ts";

export const defaultMutationHandlers: MutationRouteHandlers = {
  createIssue: handleCreateIssue,
  patchIssue: handlePatchIssue,
  transitionIssue: handleTransitionIssue,
};
