import { createApiErrorResponse } from "../errors/error-response.ts";
import { jsonResponse } from "../response/json.ts";
import type { HttpRouteHandler } from "../route-contract.ts";
import {
  createGetValidationErrorListProjectionReader,
  type ValidationErrorListReader,
} from "./get-validation-error-list-projection-reader.ts";
import {
  parseListValidationErrorsQuery,
  ValidationErrorListQueryValidationError,
} from "./list-validation-errors-query-params.ts";
import { createQueryValidationErrorResponse } from "./query-handler-responses.ts";

function createValidationErrorListResponse(
  items: ReturnType<ValidationErrorListReader>,
): Response {
  return jsonResponse({
    items,
  });
}

export function createGetValidationErrorListHandler(
  validationErrorListReader: ValidationErrorListReader =
    createGetValidationErrorListProjectionReader(),
): HttpRouteHandler {
  return async function handleGetValidationErrorList(
    request: Request,
  ): Promise<Response> {
    try {
      const query = parseListValidationErrorsQuery(request);
      const items = validationErrorListReader(query);

      return createValidationErrorListResponse(items);
    } catch (error) {
      if (error instanceof ValidationErrorListQueryValidationError) {
        return createQueryValidationErrorResponse({
          code: "validation_error_list_validation_failed",
          message: "Validation error list validation failed.",
          errors: error.errors,
        });
      }

      return createApiErrorResponse(error);
    }
  };
}

export const handleGetValidationErrorList = createGetValidationErrorListHandler();
