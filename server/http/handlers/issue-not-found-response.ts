import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";

export function createIssueNotFoundResponse(issueId: string): Response {
  return createApiErrorResponse(
    createApiError({
      status: 404,
      code: "issue_not_found",
      message: "The requested issue was not found.",
      details: {
        issueId,
      },
    }),
  );
}
