import type { IssueStatus } from "../../core/types/index.ts";
import type { TransitionIssueInput } from "./transition-issue-input.ts";
import {
  createTransitionIssueRequestValidationError,
  createTransitionIssueValidationError,
  TransitionIssueValidationError,
} from "./transition-issue-validation-error.ts";

const ISSUE_STATUSES = [
  "proposed",
  "accepted",
  "in_progress",
  "completed",
  "canceled",
] as const satisfies readonly IssueStatus[];

const TRANSITION_INPUT_FIELD_NAMES = [
  "expectedRevision",
  "to_status",
  "resolution",
] as const;

export interface NormalizedTransitionIssueInput extends TransitionIssueInput {
  to_status: IssueStatus;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createUnknownFieldValidationErrors(
  input: Record<string, unknown>,
) {
  const allowedFieldNames = new Set(TRANSITION_INPUT_FIELD_NAMES);

  return Object.keys(input)
    .filter((fieldName) => !allowedFieldNames.has(fieldName))
    .sort((left, right) => left.localeCompare(right))
    .map((fieldName) =>
      createTransitionIssueRequestValidationError({
        code: "transition.unknown_field",
        path: `/${fieldName}`,
        message:
          `Transition requests must not include unknown field \`${fieldName}\`.`,
        details: {
          field: fieldName,
        },
      }),
    );
}

function validateTransitionIssueInput(input: Record<string, unknown>): void {
  const validationErrors = createUnknownFieldValidationErrors(input);

  if (!hasOwn(input, "expectedRevision")) {
    validationErrors.push(
      createTransitionIssueRequestValidationError({
        code: "transition.expected_revision_required",
        path: "/expectedRevision",
        message: "Transition requests must include `expectedRevision`.",
      }),
    );
  } else if (
    typeof input.expectedRevision !== "string" ||
    input.expectedRevision.length === 0
  ) {
    validationErrors.push(
      createTransitionIssueRequestValidationError({
        code: "transition.expected_revision_invalid",
        path: "/expectedRevision",
        message: "Transition `expectedRevision` must be a non-empty string.",
      }),
    );
  }

  if (!hasOwn(input, "to_status")) {
    validationErrors.push(
      createTransitionIssueRequestValidationError({
        code: "transition.to_status_required",
        path: "/to_status",
        message: "Transition requests must include `to_status`.",
      }),
    );
  } else if (
    typeof input.to_status !== "string" ||
    !ISSUE_STATUSES.includes(input.to_status as IssueStatus)
  ) {
    validationErrors.push(
      createTransitionIssueRequestValidationError({
        code: "transition.to_status_invalid",
        path: "/to_status",
        message:
          "Transition `to_status` must be one of `proposed`, `accepted`, `in_progress`, `completed`, or `canceled`.",
        details: {
          to_status: input.to_status,
        },
      }),
    );
  }

  if (hasOwn(input, "resolution") && typeof input.resolution !== "string") {
    validationErrors.push(
      createTransitionIssueRequestValidationError({
        code: "transition.invalid_resolution",
        path: "/resolution",
        message: "Transition `resolution` must be a string when present.",
      }),
    );
  }

  if (validationErrors.length > 0) {
    throw new TransitionIssueValidationError(validationErrors);
  }
}

export function normalizeTransitionIssueInput(
  input: TransitionIssueInput,
): NormalizedTransitionIssueInput {
  if (!isPlainObject(input)) {
    throw createTransitionIssueValidationError(
      createTransitionIssueRequestValidationError({
        code: "transition.invalid_request_body",
        path: "/",
        message: "Transition request body must be a JSON object.",
      }),
    );
  }

  validateTransitionIssueInput(input);

  return {
    expectedRevision: input.expectedRevision,
    to_status: input.to_status,
    ...(hasOwn(input, "resolution")
      ? { resolution: input.resolution }
      : {}),
  };
}
