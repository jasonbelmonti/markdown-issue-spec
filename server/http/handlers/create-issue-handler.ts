import {
  createNotImplementedIssueMutationBoundary,
  type CreateIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import type { CreateIssueInput } from "../../application/mutations/create-issue-input.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import { parseJsonBody } from "../request/parse-json-body.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";
import type { HttpRouteHandler } from "./types.ts";

const defaultIssueMutationBoundary = createNotImplementedIssueMutationBoundary();

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

      throw new Error("Create issue mutation responses are not implemented yet.");
    } catch (error) {
      return createApiErrorResponse(error);
    }
  };
}

export const handleCreateIssue = createCreateIssueHandler();
