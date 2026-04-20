import type { IssueStatus } from "../../core/types/index.ts";
import {
  decodeIssueListCursor,
} from "../../projection/issue-list-cursor.ts";
import type { ListIssueEnvelopesQuery } from "../../projection/list-issue-envelopes.ts";
import { normalizeRfc3339SortKey } from "../../projection/rfc3339-sort-key.ts";
import type { QueryRequestValidationError } from "./query-request-validation-error.ts";

const ISSUE_STATUSES = [
  "proposed",
  "accepted",
  "in_progress",
  "completed",
  "canceled",
] as const satisfies readonly IssueStatus[];

const ISSUE_LIST_QUERY_PARAMETER_NAMES = [
  "status",
  "kind",
  "label",
  "assignee",
  "parent_id",
  "depends_on_id",
  "ready",
  "updated_after",
  "limit",
  "cursor",
] as const;

type IssueListQueryParameterName =
  typeof ISSUE_LIST_QUERY_PARAMETER_NAMES[number];
type NonEmptyIssueListQueryParameterName = Exclude<
  IssueListQueryParameterName,
  "status" | "ready" | "limit"
>;

const ISSUE_LIST_QUERY_PARAMETER_NAME_SET = new Set<string>(
  ISSUE_LIST_QUERY_PARAMETER_NAMES,
);

export const DEFAULT_ISSUE_LIST_LIMIT = 50;
export const MAX_ISSUE_LIST_LIMIT = 100;

export class IssueListQueryValidationError extends Error {
  readonly errors: readonly QueryRequestValidationError[];

  constructor(errors: readonly QueryRequestValidationError[]) {
    super("Issue list validation failed.");
    this.name = "IssueListQueryValidationError";
    this.errors = [...errors];
  }
}

function createIssueListQueryRequestValidationError(
  input: Omit<QueryRequestValidationError, "source">,
): QueryRequestValidationError {
  return {
    ...input,
    source: "request",
  };
}

function createRepeatedParameterValidationError(
  parameterName: IssueListQueryParameterName,
): QueryRequestValidationError {
  return createIssueListQueryRequestValidationError({
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
  return createIssueListQueryRequestValidationError({
    code: "query.unknown_parameter",
    path: `/${parameterName}`,
    message: `Query parameter \`${parameterName}\` is not supported.`,
    details: {
      parameter: parameterName,
    },
  });
}

function createInvalidStringValidationError(
  parameterName: NonEmptyIssueListQueryParameterName,
): QueryRequestValidationError {
  return createIssueListQueryRequestValidationError({
    code: `query.invalid_${parameterName}`,
    path: `/${parameterName}`,
    message: `Query parameter \`${parameterName}\` must be a non-empty string.`,
  });
}

function createInvalidStatusValidationError(
  status: string,
): QueryRequestValidationError {
  return createIssueListQueryRequestValidationError({
    code: "query.invalid_status",
    path: "/status",
    message:
      "Query parameter `status` must be one of `proposed`, `accepted`, `in_progress`, `completed`, or `canceled`.",
    details: {
      status,
    },
  });
}

function createInvalidReadyValidationError(
  ready: string,
): QueryRequestValidationError {
  return createIssueListQueryRequestValidationError({
    code: "query.invalid_ready",
    path: "/ready",
    message: "Query parameter `ready` must be `true` or `false`.",
    details: {
      ready,
    },
  });
}

function createInvalidLimitValidationError(
  limit: string,
): QueryRequestValidationError {
  return createIssueListQueryRequestValidationError({
    code: "query.invalid_limit",
    path: "/limit",
    message:
      `Query parameter \`limit\` must be a positive integer not exceeding ${MAX_ISSUE_LIST_LIMIT}.`,
    details: {
      limit,
      maxLimit: MAX_ISSUE_LIST_LIMIT,
    },
  });
}

function createSingleValueMap(
  searchParams: URLSearchParams,
  errors: QueryRequestValidationError[],
): Partial<Record<IssueListQueryParameterName, string>> {
  const valuesByName: Partial<Record<IssueListQueryParameterName, string>> = {};

  for (const parameterName of ISSUE_LIST_QUERY_PARAMETER_NAMES) {
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
      !ISSUE_LIST_QUERY_PARAMETER_NAME_SET.has(parameterName)
    )
    .sort((left, right) => left.localeCompare(right));

  for (const parameterName of unknownParameterNames) {
    errors.push(createUnknownParameterValidationError(parameterName));
  }
}

function parseStatus(
  value: string | undefined,
  errors: QueryRequestValidationError[],
): IssueStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!ISSUE_STATUSES.includes(value as IssueStatus)) {
    errors.push(createInvalidStatusValidationError(value));

    return undefined;
  }

  return value as IssueStatus;
}

function parseNonEmptyString(
  parameterName: NonEmptyIssueListQueryParameterName,
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

function parseReady(
  value: string | undefined,
  errors: QueryRequestValidationError[],
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  switch (value) {
    case "true":
      return true;
    case "false":
      return false;
  }

  errors.push(createInvalidReadyValidationError(value));

  return undefined;
}

function parseLimit(
  value: string | undefined,
  errors: QueryRequestValidationError[],
): number {
  if (value === undefined) {
    return DEFAULT_ISSUE_LIST_LIMIT;
  }

  if (!/^\d+$/u.test(value)) {
    errors.push(createInvalidLimitValidationError(value));

    return DEFAULT_ISSUE_LIST_LIMIT;
  }

  const parsedLimit = Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedLimit)
    || parsedLimit < 1
    || parsedLimit > MAX_ISSUE_LIST_LIMIT
  ) {
    errors.push(createInvalidLimitValidationError(value));

    return DEFAULT_ISSUE_LIST_LIMIT;
  }

  return parsedLimit;
}

function getSingleRawQueryParameterValue(
  requestUrl: string,
  parameterName: IssueListQueryParameterName,
): string | undefined {
  const queryString = new URL(requestUrl).search.slice(1);

  if (queryString.length === 0) {
    return undefined;
  }

  const matches = [...queryString.matchAll(
    new RegExp(`(?:^|&)${parameterName}=([^&]*)`, "gu"),
  )];

  if (matches.length !== 1) {
    return undefined;
  }

  return matches[0]?.[1];
}

function normalizeUpdatedAfterValue(
  updatedAfter: string,
  rawUpdatedAfter: string | undefined,
): string {
  if (rawUpdatedAfter?.includes("+")) {
    return updatedAfter.replaceAll(" ", "+");
  }

  return updatedAfter;
}

function parseUpdatedAfter(
  value: string | undefined,
  rawValue: string | undefined,
  errors: QueryRequestValidationError[],
): string | undefined {
  const updatedAfter = parseNonEmptyString("updated_after", value, errors);

  if (updatedAfter === undefined) {
    return undefined;
  }

  const normalizedUpdatedAfter = normalizeUpdatedAfterValue(
    updatedAfter,
    rawValue,
  );

  try {
    normalizeRfc3339SortKey(normalizedUpdatedAfter);
  } catch {
    errors.push(
      createIssueListQueryRequestValidationError({
        code: "query.invalid_updated_after",
        path: "/updated_after",
        message:
          "Query parameter `updated_after` must be a valid RFC3339 timestamp.",
        details: {
          updated_after: updatedAfter,
        },
      }),
    );

    return undefined;
  }

  return normalizedUpdatedAfter;
}

function parseCursor(
  value: string | undefined,
  errors: QueryRequestValidationError[],
): string | undefined {
  const cursor = parseNonEmptyString("cursor", value, errors);

  if (cursor === undefined) {
    return undefined;
  }

  try {
    decodeIssueListCursor(cursor);
  } catch {
    errors.push(
      createIssueListQueryRequestValidationError({
        code: "query.invalid_cursor",
        path: "/cursor",
        message: "Query parameter `cursor` is invalid.",
        details: {
          cursor,
        },
      }),
    );

    return undefined;
  }

  return cursor;
}

function throwIfValidationFailed(
  errors: readonly QueryRequestValidationError[],
): void {
  if (errors.length > 0) {
    throw new IssueListQueryValidationError(errors);
  }
}

export function parseListIssuesQuery(
  request: Request,
): ListIssueEnvelopesQuery {
  const searchParams = new URL(request.url).searchParams;
  const errors: QueryRequestValidationError[] = [];

  collectUnknownParameterErrors(searchParams, errors);

  const valuesByName = createSingleValueMap(searchParams, errors);
  const status = parseStatus(valuesByName.status, errors);
  const kind = parseNonEmptyString("kind", valuesByName.kind, errors);
  const label = parseNonEmptyString("label", valuesByName.label, errors);
  const assignee = parseNonEmptyString(
    "assignee",
    valuesByName.assignee,
    errors,
  );
  const parentId = parseNonEmptyString(
    "parent_id",
    valuesByName.parent_id,
    errors,
  );
  const dependsOnId = parseNonEmptyString(
    "depends_on_id",
    valuesByName.depends_on_id,
    errors,
  );
  const ready = parseReady(valuesByName.ready, errors);
  const updatedAfter = parseUpdatedAfter(
    valuesByName.updated_after,
    getSingleRawQueryParameterValue(request.url, "updated_after"),
    errors,
  );
  const limit = parseLimit(valuesByName.limit, errors);
  const cursor = parseCursor(valuesByName.cursor, errors);

  throwIfValidationFailed(errors);

  return {
    limit,
    ...(status === undefined ? {} : { status }),
    ...(kind === undefined ? {} : { kind }),
    ...(label === undefined ? {} : { label }),
    ...(assignee === undefined ? {} : { assignee }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(dependsOnId === undefined ? {} : { dependsOnId }),
    ...(ready === undefined ? {} : { ready }),
    ...(updatedAfter === undefined ? {} : { updatedAfter }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}
