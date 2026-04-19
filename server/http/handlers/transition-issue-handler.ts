import {
  type TransitionIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import { createFilesystemTransitionIssueMutationBoundary } from "../../application/mutations/filesystem-transition-issue-mutation-boundary.ts";
import type { TransitionIssueInput } from "../../application/mutations/transition-issue-input.ts";
import { TransitionIssueNotFoundError } from "../../application/mutations/transition-issue-not-found-error.ts";
import { TransitionIssueValidationError } from "../../application/mutations/transition-issue-validation-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import { parseJsonBody } from "../request/parse-json-body.ts";
import { jsonResponse } from "../response/json.ts";
import type { HttpRouteHandler, HttpRouteRequest } from "../route-contract.ts";
import { defaultFilesystemIssueMutationLock } from "./default-filesystem-issue-mutation-lock.ts";
import { getIssueIdFromRequest } from "./issue-id-from-request.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";
import {
  createTransitionIssueNotFoundResponse,
  createTransitionRevisionMismatchResponse,
  createTransitionValidationErrorResponse,
} from "./transition-issue-handler-responses.ts";

const defaultIssueMutationBoundary = createFilesystemTransitionIssueMutationBoundary({
  rootDirectory: process.cwd(),
  mutationLock: defaultFilesystemIssueMutationLock,
});

async function parseTransitionIssueInput(
  request: Request,
): Promise<TransitionIssueInput> {
  return parseJsonBody<TransitionIssueInput>(request);
}

export function createTransitionIssueHandler(
  issueMutationBoundary: TransitionIssueMutationBoundary = defaultIssueMutationBoundary,
): HttpRouteHandler {
  return async function handleTransitionIssue(
    request: HttpRouteRequest,
  ): Promise<Response> {
    const issueId = getIssueIdFromRequest(request, 1);

    try {
      const result = await issueMutationBoundary.transitionIssue({
        kind: "transition_issue",
        issueId,
        input: await parseTransitionIssueInput(request),
      });

      if (result.status === "not_implemented") {
        return createNotImplementedMutationResponse(result);
      }

      if (result.status === "revision_mismatch") {
        return createTransitionRevisionMismatchResponse(result);
      }

      return jsonResponse(result.envelope);
    } catch (error) {
      if (error instanceof TransitionIssueValidationError) {
        return createTransitionValidationErrorResponse(error);
      }

      if (error instanceof TransitionIssueNotFoundError) {
        return createTransitionIssueNotFoundResponse(error.issueId);
      }

      return createApiErrorResponse(error);
    }
  };
}

export const handleTransitionIssue = createTransitionIssueHandler();
