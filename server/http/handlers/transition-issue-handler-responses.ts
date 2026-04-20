import { TransitionIssueValidationError } from "../../application/mutations/transition-issue-validation-error.ts";
import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import type { TransitionIssueMutationBoundary } from "../../application/mutations/issue-mutation-boundary.ts";
import { createIssueNotFoundResponse } from "./issue-not-found-response.ts";

export function createTransitionRevisionMismatchResponse(
  result: Extract<
    Awaited<ReturnType<TransitionIssueMutationBoundary["transitionIssue"]>>,
    { status: "revision_mismatch" }
  >,
): Response {
  return createApiErrorResponse(
    createApiError({
      status: 409,
      code: "revision_mismatch",
      message: "The issue revision does not match the expected revision.",
      details: {
        issueId: result.issueId,
        expectedRevision: result.expectedRevision,
        currentRevision: result.currentRevision,
      },
    }),
  );
}

export function createTransitionValidationErrorResponse(
  error: TransitionIssueValidationError,
): Response {
  return createApiErrorResponse(
    createApiError({
      status: 422,
      code: "issue_transition_validation_failed",
      message: "Issue transition validation failed.",
      details: {
        errors: error.errors,
      },
    }),
  );
}

export const createTransitionIssueNotFoundResponse = createIssueNotFoundResponse;
