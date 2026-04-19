import { createApiError } from "../errors/api-error.ts";
import { createApiErrorResponse } from "../errors/error-response.ts";
import type { HttpRouteHandler } from "../route-contract.ts";

export interface NotImplementedHandlerOptions {
  code: string;
  endpoint: string;
}

export function createNotImplementedHandler(
  options: NotImplementedHandlerOptions,
): HttpRouteHandler {
  return function handleNotImplementedRequest(_request: Request): Response {
    return createApiErrorResponse(
      createApiError({
        status: 501,
        code: options.code,
        message: `${options.endpoint} is not implemented yet.`,
        details: {
          endpoint: options.endpoint,
        },
      }),
    );
  };
}
