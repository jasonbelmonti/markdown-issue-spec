import {
  createNotImplementedIssueMutationBoundary,
  type CreateIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";
import type { HttpRouteHandler } from "./types.ts";

const defaultIssueMutationBoundary = createNotImplementedIssueMutationBoundary();

export function createCreateIssueHandler(
  issueMutationBoundary: CreateIssueMutationBoundary = defaultIssueMutationBoundary,
): HttpRouteHandler {
  return async function handleCreateIssue(_request: Request): Promise<Response> {
    const result = await issueMutationBoundary.createIssue({
      kind: "create_issue",
    });

    if (result.status === "not_implemented") {
      return createNotImplementedMutationResponse(result);
    }

    throw new Error("Create issue mutation responses are not implemented yet.");
  };
}

export const handleCreateIssue = createCreateIssueHandler();
