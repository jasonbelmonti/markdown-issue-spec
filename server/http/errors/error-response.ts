import {
  ApiError,
  createApiError,
  type ApiErrorDetails,
  isApiError,
} from "./api-error.ts";
import { jsonResponse } from "../response/json.ts";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetails;
  };
}

function toApiErrorBody(error: ApiError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  };
}

function createInternalServerError(): ApiError {
  return createApiError({
    status: 500,
    code: "internal_server_error",
    message: "The server failed to process the request.",
  });
}

export function normalizeApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  return createInternalServerError();
}

export function createApiErrorResponse(error: unknown): Response {
  const apiError = normalizeApiError(error);

  return jsonResponse(toApiErrorBody(apiError), {
    status: apiError.status,
  });
}
