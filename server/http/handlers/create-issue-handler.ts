import {
  type CreateIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import type { CreateIssueInput } from "../../application/mutations/create-issue-input.ts";
import { CreateIssueValidationError } from "../../application/mutations/create-issue-validation-error.ts";
import { createFilesystemCreateIssueMutationBoundary } from "../../application/mutations/filesystem-create-issue-mutation-boundary.ts";
import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import { parseJsonBody } from "../request/parse-json-body.ts";
import { jsonResponse } from "../response/json.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";
import type { HttpRouteHandler } from "./types.ts";

const defaultIssueMutationBoundary = createFilesystemCreateIssueMutationBoundary({
  rootDirectory: process.cwd(),
});

async function parseCreateIssueInput(
  request: Request,
): Promise<CreateIssueInput> {
  return parseJsonBody<CreateIssueInput>(request);
}

export function createCreateIssueHandler(
  issueMutationBoundary: CreateIssueMutationBoundary = defaultIssueMutationBoundary,
): HttpRouteHandler {
  return async function handleCreateIssue(request: Request): Promise<Response> {
    try {
      const result = await issueMutationBoundary.createIssue({
        kind: "create_issue",
        input: await parseCreateIssueInput(request),
      });

      if (result.status === "not_implemented") {
        return createNotImplementedMutationResponse(result);
      }

      return jsonResponse(result.envelope, {
        status: 201,
      });
    } catch (error) {
      if (error instanceof CreateIssueValidationError) {
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

      return createApiErrorResponse(error);
    }
  };
}

export const handleCreateIssue = createCreateIssueHandler();
