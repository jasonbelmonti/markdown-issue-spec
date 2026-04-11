export interface ApiErrorDetails {
  [key: string]: unknown;
}

export interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetails;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function createApiError(options: ApiErrorOptions): ApiError {
  return new ApiError(options);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
