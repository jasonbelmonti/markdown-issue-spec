import type { ApiErrorDetails } from "../errors/api-error.ts";

export interface QueryRequestValidationError {
  code: string;
  source: "request";
  path: string;
  message: string;
  details?: ApiErrorDetails;
}
