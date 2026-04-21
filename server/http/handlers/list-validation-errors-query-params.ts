import type { ValidationError } from "../../core/types/index.ts";
import type { ListValidationErrorsQuery } from "../../projection/index.ts";
import type { QueryRequestValidationError } from "./query-request-validation-error.ts";

const VALIDATION_ERROR_SEVERITIES = [
  "error",
  "warning",
] as const satisfies readonly ValidationError["severity"][];

const VALIDATION_ERROR_LIST_QUERY_PARAMETER_NAMES = [
  "issue_id",
  "severity",
  "code",
] as const;

type ValidationErrorListQueryParameterName =
  typeof VALIDATION_ERROR_LIST_QUERY_PARAMETER_NAMES[number];
type NonEmptyValidationErrorListQueryParameterName = Exclude<
  ValidationErrorListQueryParameterName,
  "severity"
>;

const VALIDATION_ERROR_LIST_QUERY_PARAMETER_NAME_SET = new Set<string>(
  VALIDATION_ERROR_LIST_QUERY_PARAMETER_NAMES,
);

export class ValidationErrorListQueryValidationError extends Error {
  readonly errors: readonly QueryRequestValidationError[];

  constructor(errors: readonly QueryRequestValidationError[]) {
    super("Validation error list validation failed.");
    this.name = "ValidationErrorListQueryValidationError";
    this.errors = [...errors];
  }
}

function createValidationErrorListQueryRequestValidationError(
  input: Omit<QueryRequestValidationError, "source">,
): QueryRequestValidationError {
  return {
    ...input,
    source: "request",
  };
}

function createRepeatedParameterValidationError(
  parameterName: ValidationErrorListQueryParameterName,
): QueryRequestValidationError {
  return createValidationErrorListQueryRequestValidationError({
    code: "query.repeated_parameter",
    path: `/${parameterName}`,
    message: `Query parameter \`${parameterName}\` must not be repeated.`,
    details: {
      parameter: parameterName,
    },
  });
}

function createUnknownParameterValidationError(
  parameterName: string,
): QueryRequestValidationError {
  return createValidationErrorListQueryRequestValidationError({
    code: "query.unknown_parameter",
    path: `/${parameterName}`,
    message: `Query parameter \`${parameterName}\` is not supported.`,
    details: {
      parameter: parameterName,
    },
  });
}

function createInvalidStringValidationError(
  parameterName: NonEmptyValidationErrorListQueryParameterName,
): QueryRequestValidationError {
  return createValidationErrorListQueryRequestValidationError({
    code: `query.invalid_${parameterName}`,
    path: `/${parameterName}`,
    message: `Query parameter \`${parameterName}\` must be a non-empty string.`,
  });
}

function createInvalidSeverityValidationError(
  severity: string,
): QueryRequestValidationError {
  return createValidationErrorListQueryRequestValidationError({
    code: "query.invalid_severity",
    path: "/severity",
    message:
      "Query parameter `severity` must be one of `error` or `warning`.",
    details: {
      severity,
    },
  });
}

function createSingleValueMap(
  searchParams: URLSearchParams,
  errors: QueryRequestValidationError[],
): Partial<Record<ValidationErrorListQueryParameterName, string>> {
  const valuesByName: Partial<
    Record<ValidationErrorListQueryParameterName, string>
  > = {};

  for (const parameterName of VALIDATION_ERROR_LIST_QUERY_PARAMETER_NAMES) {
    const values = searchParams.getAll(parameterName);

    if (values.length === 0) {
      continue;
    }

    if (values.length > 1) {
      errors.push(createRepeatedParameterValidationError(parameterName));
      continue;
    }

    const [value] = values;

    if (value === undefined) {
      continue;
    }

    valuesByName[parameterName] = value;
  }

  return valuesByName;
}

function collectUnknownParameterErrors(
  searchParams: URLSearchParams,
  errors: QueryRequestValidationError[],
): void {
  const unknownParameterNames = [...new Set(searchParams.keys())]
    .filter((parameterName) =>
      !VALIDATION_ERROR_LIST_QUERY_PARAMETER_NAME_SET.has(parameterName)
    )
    .sort((left, right) => left.localeCompare(right));

  for (const parameterName of unknownParameterNames) {
    errors.push(createUnknownParameterValidationError(parameterName));
  }
}

function parseNonEmptyString(
  parameterName: NonEmptyValidationErrorListQueryParameterName,
  value: string | undefined,
  errors: QueryRequestValidationError[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value.length === 0) {
    errors.push(createInvalidStringValidationError(parameterName));

    return undefined;
  }

  return value;
}

function parseSeverity(
  value: string | undefined,
  errors: QueryRequestValidationError[],
): ValidationError["severity"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!VALIDATION_ERROR_SEVERITIES.includes(value as ValidationError["severity"])) {
    errors.push(createInvalidSeverityValidationError(value));

    return undefined;
  }

  return value as ValidationError["severity"];
}

export function parseListValidationErrorsQuery(
  request: Request,
): ListValidationErrorsQuery {
  const url = new URL(request.url);
  const errors: QueryRequestValidationError[] = [];
  collectUnknownParameterErrors(url.searchParams, errors);

  const values = createSingleValueMap(url.searchParams, errors);
  const issueId = parseNonEmptyString("issue_id", values.issue_id, errors);
  const severity = parseSeverity(values.severity, errors);
  const code = parseNonEmptyString("code", values.code, errors);
  const query: ListValidationErrorsQuery = {};

  if (issueId !== undefined) {
    query.issue_id = issueId;
  }

  if (severity !== undefined) {
    query.severity = severity;
  }

  if (code !== undefined) {
    query.code = code;
  }

  if (errors.length > 0) {
    throw new ValidationErrorListQueryValidationError(errors);
  }

  return query;
}
