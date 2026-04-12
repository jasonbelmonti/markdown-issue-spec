import {
  type PatchIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import { createNotImplementedIssueMutationBoundary } from "../../application/mutations/not-implemented-issue-mutation-boundary.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";
import type { HttpRouteHandler, HttpRouteRequest } from "./types.ts";

function getIssueIdFromRequest(request: HttpRouteRequest): string {
  if (request.params?.id !== undefined) {
    return request.params.id;
  }

  const pathname = new URL(request.url).pathname;
  const encodedIssueId = pathname.split("/").at(-1) ?? "";

  try {
    return decodeURIComponent(encodedIssueId);
  } catch {
    return encodedIssueId;
  }
}

const defaultIssueMutationBoundary = createNotImplementedIssueMutationBoundary();

export function createPatchIssueHandler(
  issueMutationBoundary: PatchIssueMutationBoundary = defaultIssueMutationBoundary,
): HttpRouteHandler {
  return async function handlePatchIssue(
    request: HttpRouteRequest,
  ): Promise<Response> {
    const result = await issueMutationBoundary.patchIssue({
      kind: "patch_issue",
      issueId: getIssueIdFromRequest(request),
    });

    if (result.status === "not_implemented") {
      return createNotImplementedMutationResponse(result);
    }

    throw new Error("Patch issue mutation responses are not implemented yet.");
  };
}

export const handlePatchIssue = createPatchIssueHandler();
