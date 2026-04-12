import type { NotImplementedIssueMutationResult } from "../../application/mutations/issue-mutation-boundary.ts";
import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";

export function createNotImplementedMutationResponse(
  result: NotImplementedIssueMutationResult,
): Response {
  return createApiErrorResponse(
    createApiError({
      status: 501,
      code: result.code,
      message: `${result.endpoint} is not implemented yet.`,
      details: {
        endpoint: result.endpoint,
      },
    }),
  );
}
