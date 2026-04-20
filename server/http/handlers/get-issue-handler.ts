import { createApiErrorResponse } from "../errors/error-response.ts";
import { jsonResponse } from "../response/json.ts";
import type { HttpRouteHandler, HttpRouteRequest } from "../route-contract.ts";
import { getIssueIdFromRequest } from "./issue-id-from-request.ts";
import {
  createGetIssueProjectionReader,
  type GetIssueEnvelopeReader,
} from "./get-issue-projection-reader.ts";
import { createIssueNotFoundResponse } from "./issue-not-found-response.ts";

export function createGetIssueHandler(
  issueEnvelopeReader: GetIssueEnvelopeReader = createGetIssueProjectionReader(),
): HttpRouteHandler {
  return async function handleGetIssue(
    request: HttpRouteRequest,
  ): Promise<Response> {
    const issueId = getIssueIdFromRequest(request);

    try {
      const envelope = issueEnvelopeReader(issueId);

      if (envelope == null) {
        return createIssueNotFoundResponse(issueId);
      }

      return jsonResponse(envelope);
    } catch (error) {
      return createApiErrorResponse(error);
    }
  };
}

export const handleGetIssue = createGetIssueHandler();
