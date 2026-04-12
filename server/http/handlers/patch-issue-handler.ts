import {
  createNotImplementedIssueMutationBoundary,
  type PatchIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import { createNotImplementedMutationResponse } from "./not-implemented-mutation-response.ts";
import type { HttpRouteHandler } from "./types.ts";

function getIssueIdFromRequest(request: Request): string {
  const pathname = new URL(request.url).pathname;

  return pathname.split("/").at(-1) ?? "";
}

const defaultIssueMutationBoundary = createNotImplementedIssueMutationBoundary();

export function createPatchIssueHandler(
  issueMutationBoundary: PatchIssueMutationBoundary = defaultIssueMutationBoundary,
): HttpRouteHandler {
  return async function handlePatchIssue(request: Request): Promise<Response> {
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
