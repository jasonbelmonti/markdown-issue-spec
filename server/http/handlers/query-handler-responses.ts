import {
  createApiError,
} from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import type { QueryRequestValidationError } from "./query-request-validation-error.ts";

export interface QueryValidationErrorResponseOptions {
  code: string;
  message: string;
  errors: readonly QueryRequestValidationError[];
}

export function createQueryValidationErrorResponse(
  options: QueryValidationErrorResponseOptions,
): Response {
  return createApiErrorResponse(
    createApiError({
      status: 400,
      code: options.code,
      message: options.message,
      details: {
        errors: options.errors,
      },
    }),
  );
}
