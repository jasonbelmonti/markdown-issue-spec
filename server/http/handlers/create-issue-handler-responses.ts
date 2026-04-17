import { CreateIssueValidationError } from "../../application/mutations/create-issue-validation-error.ts";
import type { CreateIssueMutationBoundary } from "../../application/mutations/issue-mutation-boundary.ts";
import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import { jsonResponse } from "../response/json.ts";

type AppliedCreateIssueResult = Extract<
  Awaited<ReturnType<CreateIssueMutationBoundary["createIssue"]>>,
  { status: "applied" }
>;

export function createCreatedIssueResponse(
  result: AppliedCreateIssueResult,
): Response {
  return jsonResponse(result.envelope, {
    status: 201,
  });
}

export function createCreateValidationErrorResponse(
  error: CreateIssueValidationError,
): Response {
  return createApiErrorResponse(
    createApiError({
      status: 422,
      code: "issue_create_validation_failed",
      message: "Issue create validation failed.",
      details: {
        errors: error.errors,
      },
    }),
  );
}
