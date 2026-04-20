import { handleGetIssue } from "./get-issue-handler.ts";
import { handleGetIssueList } from "./get-issue-list-handler.ts";
import { createNotImplementedHandler } from "./not-implemented.ts";
import type { QueryRouteHandlers } from "./types.ts";

export const defaultQueryHandlers: QueryRouteHandlers = {
  getIssue: handleGetIssue,
  listIssues: handleGetIssueList,
  listValidationErrors: createNotImplementedHandler({
    code: "validation_error_list_not_implemented",
    endpoint: "GET /validation/errors",
  }),
};
