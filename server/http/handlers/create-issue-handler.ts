import {
  type CreateIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import type { CreateIssueInput } from "../../application/mutations/create-issue-input.ts";
import { CreateIssueValidationError } from "../../application/mutations/create-issue-validation-error.ts";
import { createFilesystemCreateIssueMutationBoundary } from "../../application/mutations/filesystem-create-issue-mutation-boundary.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import { parseJsonBody } from "../request/parse-json-body.ts";
import type { HttpRouteHandler } from "../route-contract.ts";
import {
  createCreateValidationErrorResponse,
  createCreatedIssueResponse,
} from "./create-issue-handler-responses.ts";
import { defaultFilesystemIssueMutationLock } from "./default-filesystem-issue-mutation-lock.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";

const defaultCreateIssueMutationBoundary = createFilesystemCreateIssueMutationBoundary({
  rootDirectory: process.cwd(),
  mutationLock: defaultFilesystemIssueMutationLock,
});

async function parseCreateIssueInput(
  request: Request,
): Promise<CreateIssueInput> {
  return parseJsonBody<CreateIssueInput>(request);
}

export function createCreateIssueHandler(
  issueMutationBoundary: CreateIssueMutationBoundary = defaultCreateIssueMutationBoundary,
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

      return createCreatedIssueResponse(result);
    } catch (error) {
      if (error instanceof CreateIssueValidationError) {
        return createCreateValidationErrorResponse(error);
      }

      return createApiErrorResponse(error);
    }
  };
}

export const handleCreateIssue = createCreateIssueHandler();
