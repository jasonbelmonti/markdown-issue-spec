import { expect, test } from "bun:test";

import { createQueryValidationErrorResponse } from "./query-handler-responses.ts";

test("createQueryValidationErrorResponse returns deterministic invalid-query json", async () => {
  const response = createQueryValidationErrorResponse({
    code: "issue_list_validation_failed",
    message: "Issue list validation failed.",
    errors: [
      {
        code: "query.invalid_limit",
        source: "request",
        path: "/limit",
        message: "Query parameter `limit` must be a positive integer.",
        details: {
          limit: "zero",
        },
      },
    ],
  });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "issue_list_validation_failed",
      message: "Issue list validation failed.",
      details: {
        errors: [
          {
            code: "query.invalid_limit",
            source: "request",
            path: "/limit",
            message: "Query parameter `limit` must be a positive integer.",
            details: {
              limit: "zero",
            },
          },
        ],
      },
    },
  });
});
