import { expect, test } from "bun:test";

import {
  parseListValidationErrorsQuery,
  ValidationErrorListQueryValidationError,
} from "./list-validation-errors-query-params.ts";

function createValidationErrorsRequest(
  pathnameWithSearch = "/validation/errors",
): Request {
  return new Request(`http://localhost${pathnameWithSearch}`, {
    method: "GET",
  });
}

test("parseListValidationErrorsQuery maps supported single-valued filters onto the projection query", () => {
  expect(
    parseListValidationErrorsQuery(
      createValidationErrorsRequest(
        "/validation/errors?issue_id=ISSUE-1000&severity=warning&code=schema.required",
      ),
    ),
  ).toEqual({
    issue_id: "ISSUE-1000",
    severity: "warning",
    code: "schema.required",
  });
});

test("parseListValidationErrorsQuery returns an empty query when filters are omitted", () => {
  expect(parseListValidationErrorsQuery(createValidationErrorsRequest())).toEqual(
    {},
  );
});

test("parseListValidationErrorsQuery rejects invalid and repeated query parameters deterministically", () => {
  const request = createValidationErrorsRequest(
    "/validation/errors?severity=error&severity=warning&zzz=1",
  );

  expect(() => parseListValidationErrorsQuery(request)).toThrow(
    ValidationErrorListQueryValidationError,
  );

  try {
    parseListValidationErrorsQuery(request);
    throw new Error("Expected query validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationErrorListQueryValidationError);

    if (!(error instanceof ValidationErrorListQueryValidationError)) {
      return;
    }

    expect(error.errors).toEqual([
      {
        code: "query.unknown_parameter",
        source: "request",
        path: "/zzz",
        message: "Query parameter `zzz` is not supported.",
        details: {
          parameter: "zzz",
        },
      },
      {
        code: "query.repeated_parameter",
        source: "request",
        path: "/severity",
        message: "Query parameter `severity` must not be repeated.",
        details: {
          parameter: "severity",
        },
      },
    ]);
  }
});

test("parseListValidationErrorsQuery rejects invalid severity and empty string filters", () => {
  const request = createValidationErrorsRequest(
    "/validation/errors?issue_id=&severity=fatal&code=",
  );

  try {
    parseListValidationErrorsQuery(request);
    throw new Error("Expected query validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationErrorListQueryValidationError);

    if (!(error instanceof ValidationErrorListQueryValidationError)) {
      return;
    }

    expect(error.errors).toEqual([
      {
        code: "query.invalid_issue_id",
        source: "request",
        path: "/issue_id",
        message: "Query parameter `issue_id` must be a non-empty string.",
      },
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
      {
        code: "query.invalid_code",
        source: "request",
        path: "/code",
        message: "Query parameter `code` must be a non-empty string.",
      },
    ]);
  }
});
