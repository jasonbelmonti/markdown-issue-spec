import {
  type PatchIssueMutationBoundary,
} from "../../application/mutations/issue-mutation-boundary.ts";
import { createFilesystemPatchIssueMutationBoundary } from "../../application/mutations/filesystem-patch-issue-mutation-boundary.ts";
import type { PatchIssueInput } from "../../application/mutations/patch-issue-input.ts";
import { PatchIssueNotFoundError } from "../../application/mutations/patch-issue-not-found-error.ts";
import { PatchIssueValidationError } from "../../application/mutations/patch-issue-validation-error.ts";
import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import { parseJsonBody } from "../request/parse-json-body.ts";
import { jsonResponse } from "../response/json.ts";
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

const defaultIssueMutationBoundary = createFilesystemPatchIssueMutationBoundary({
  rootDirectory: process.cwd(),
});

async function parsePatchIssueInput(
  request: Request,
): Promise<PatchIssueInput> {
  return parseJsonBody<PatchIssueInput>(request);
}

function createRevisionMismatchResponse(
  result: Extract<
    Awaited<ReturnType<PatchIssueMutationBoundary["patchIssue"]>>,
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

function createPatchValidationErrorResponse(
  error: PatchIssueValidationError,
): Response {
  return createApiErrorResponse(
    createApiError({
      status: 422,
      code: "issue_patch_validation_failed",
      message: "Issue patch validation failed.",
      details: {
        errors: error.errors,
      },
    }),
  );
}

function createIssueNotFoundResponse(issueId: string): Response {
  return createApiErrorResponse(
    createApiError({
      status: 404,
      code: "issue_not_found",
      message: "The requested issue was not found.",
      details: {
        issueId,
      },
    }),
  );
}

export function createPatchIssueHandler(
  issueMutationBoundary: PatchIssueMutationBoundary = defaultIssueMutationBoundary,
): HttpRouteHandler {
  return async function handlePatchIssue(
    request: HttpRouteRequest,
  ): Promise<Response> {
    const issueId = getIssueIdFromRequest(request);

    try {
      const result = await issueMutationBoundary.patchIssue({
        kind: "patch_issue",
        issueId,
        input: await parsePatchIssueInput(request),
      });

      if (result.status === "not_implemented") {
        return createNotImplementedMutationResponse(result);
      }

      if (result.status === "revision_mismatch") {
        return createRevisionMismatchResponse(result);
      }

      return jsonResponse(result.envelope);
    } catch (error) {
      if (error instanceof PatchIssueValidationError) {
        return createPatchValidationErrorResponse(error);
      }

      if (error instanceof PatchIssueNotFoundError) {
        return createIssueNotFoundResponse(error.issueId);
      }

      return createApiErrorResponse(error);
    }
  };
}

export const handlePatchIssue = createPatchIssueHandler();
