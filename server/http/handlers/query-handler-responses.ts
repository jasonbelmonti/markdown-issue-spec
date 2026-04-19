import {
  createApiError,
  type ApiErrorDetails,
} from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";

export interface QueryRequestValidationError {
  code: string;
  source: "request";
  path: string;
  message: string;
  details?: ApiErrorDetails;
}

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
      status: 422,
      code: options.code,
      message: options.message,
      details: {
        errors: options.errors,
      },
    }),
  );
}
