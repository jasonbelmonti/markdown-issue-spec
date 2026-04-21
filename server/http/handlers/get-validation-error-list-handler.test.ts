import { expect, test } from "bun:test";

import { createGetValidationErrorListHandler } from "./get-validation-error-list-handler.ts";
import {
  ISSUE_1000_UNRESOLVED_REFERENCE_VALIDATION_ERROR,
} from "../validation-error-test-fixtures.ts";

test("createGetValidationErrorListHandler delegates the normalized list query and returns json", async () => {
  const observedQueries: unknown[] = [];
  const handler = createGetValidationErrorListHandler((query) => {
    observedQueries.push(query);

    return [ISSUE_1000_UNRESOLVED_REFERENCE_VALIDATION_ERROR];
  });

  const response = await handler(
    new Request(
      "http://localhost/validation/errors?issue_id=ISSUE-1000&severity=error&code=graph.unresolved_reference",
      {
        method: "GET",
      },
    ),
  );

  expect(observedQueries).toEqual([
    {
      issue_id: "ISSUE-1000",
      severity: "error",
      code: "graph.unresolved_reference",
    },
  ]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [ISSUE_1000_UNRESOLVED_REFERENCE_VALIDATION_ERROR],
  });
});

test("createGetValidationErrorListHandler returns deterministic 400 validation errors before delegation", async () => {
  let wasReaderCalled = false;
  const handler = createGetValidationErrorListHandler(() => {
    wasReaderCalled = true;

    return [];
  });

  const response = await handler(
    new Request("http://localhost/validation/errors?severity=fatal", {
      method: "GET",
    }),
  );

  expect(wasReaderCalled).toBe(false);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: {
      code: "validation_error_list_validation_failed",
      message: "Validation error list validation failed.",
      details: {
        errors: [
          {
            code: "query.invalid_severity",
            source: "request",
            path: "/severity",
            message:
              "Query parameter `severity` must be one of `error` or `warning`.",
            details: {
              severity: "fatal",
            },
          },
        ],
      },
    },
  });
});
