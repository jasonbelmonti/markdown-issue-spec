import { handleGetIssue } from "./get-issue-handler.ts";
import { handleGetIssueList } from "./get-issue-list-handler.ts";
import { handleGetValidationErrorList } from "./get-validation-error-list-handler.ts";
import type { QueryRouteHandlers } from "./types.ts";

export const defaultQueryHandlers: QueryRouteHandlers = {
  getIssue: handleGetIssue,
  listIssues: handleGetIssueList,
  listValidationErrors: handleGetValidationErrorList,
};
