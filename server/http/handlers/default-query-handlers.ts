import { handleGetIssue } from "./get-issue-handler.ts";
import { createNotImplementedHandler } from "./not-implemented.ts";
import type { QueryRouteHandlers } from "./types.ts";

export const defaultQueryHandlers: QueryRouteHandlers = {
  getIssue: handleGetIssue,
  listIssues: createNotImplementedHandler({
    code: "issue_list_not_implemented",
    endpoint: "GET /issues",
  }),
  listValidationErrors: createNotImplementedHandler({
    code: "validation_error_list_not_implemented",
    endpoint: "GET /validation/errors",
  }),
};
