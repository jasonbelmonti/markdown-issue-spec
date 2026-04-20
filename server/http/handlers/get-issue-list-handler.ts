import { createApiErrorResponse } from "../errors/error-response.ts";
import { jsonResponse } from "../response/json.ts";
import type { HttpRouteHandler } from "../route-contract.ts";
import {
  createGetIssueListProjectionReader,
  type IssueListPageReader,
} from "./get-issue-list-projection-reader.ts";
import {
  IssueListQueryValidationError,
  parseListIssuesQuery,
} from "./list-issues-query-params.ts";
import { createQueryValidationErrorResponse } from "./query-handler-responses.ts";

function createIssueListResponse(result: ReturnType<IssueListPageReader>): Response {
  return jsonResponse({
    items: result.items,
    ...(result.nextCursor === null ? {} : { next_cursor: result.nextCursor }),
  });
}

export function createGetIssueListHandler(
  issueListPageReader: IssueListPageReader = createGetIssueListProjectionReader(),
): HttpRouteHandler {
  return async function handleGetIssueList(request: Request): Promise<Response> {
    try {
      const query = parseListIssuesQuery(request);
      const page = issueListPageReader(query);

      return createIssueListResponse(page);
    } catch (error) {
      if (error instanceof IssueListQueryValidationError) {
        return createQueryValidationErrorResponse({
          code: "issue_list_validation_failed",
          message: "Issue list validation failed.",
          errors: error.errors,
        });
      }

      return createApiErrorResponse(error);
    }
  };
}

export const handleGetIssueList = createGetIssueListHandler();
