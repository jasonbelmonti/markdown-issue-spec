import { normalizeIssueLinks } from "../../core/parser/index.ts";
import type { IssueLink } from "../../core/types/index.ts";
import type { PatchIssueInput } from "./patch-issue-input.ts";
import {
  createPatchIssueRequestValidationError,
  PatchIssueValidationError,
} from "./patch-issue-validation-error.ts";

const MUTABLE_PATCH_FIELD_NAMES = [
  "title",
  "kind",
  "status",
  "resolution",
  "summary",
  "body",
  "priority",
  "labels",
  "assignees",
  "links",
  "extensions",
] as const;

const IMMUTABLE_PATCH_FIELD_NAMES = [
  "id",
  "spec_version",
  "created_at",
  "updated_at",
] as const;
const PATCH_INPUT_FIELD_NAMES = [
  "expectedRevision",
  ...MUTABLE_PATCH_FIELD_NAMES,
  ...IMMUTABLE_PATCH_FIELD_NAMES,
] as const;

type MutablePatchFieldName = (typeof MUTABLE_PATCH_FIELD_NAMES)[number];

export interface NormalizedPatchIssueInput extends PatchIssueInput {
  links?: IssueLink[];
  providedFields: ReadonlySet<MutablePatchFieldName>;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createImmutableFieldValidationErrors(
  input: Record<string, unknown>,
) {
  return IMMUTABLE_PATCH_FIELD_NAMES.flatMap((fieldName) =>
    hasOwn(input, fieldName)
      ? [
          createPatchIssueRequestValidationError({
            code: "patch.immutable_field",
            path: `/${fieldName}`,
            message: `Patch requests must not include \`${fieldName}\`.`,
            details: {
              field: fieldName,
            },
          }),
        ]
      : [],
  );
}

function createUnknownFieldValidationErrors(
  input: Record<string, unknown>,
) {
  const allowedFieldNames = new Set(PATCH_INPUT_FIELD_NAMES);

  return Object.keys(input)
    .filter((fieldName) => !allowedFieldNames.has(fieldName))
    .sort((left, right) => left.localeCompare(right))
    .map((fieldName) =>
      createPatchIssueRequestValidationError({
        code: "patch.unknown_field",
        path: `/${fieldName}`,
        message: `Patch requests must not include unknown field \`${fieldName}\`.`,
        details: {
          field: fieldName,
        },
      }),
    );
}

function normalizePatchIssueLinks(input: Record<string, unknown>) {
  if (!hasOwn(input, "links")) {
    return undefined;
  }

  try {
    return normalizeIssueLinks(input.links);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new PatchIssueValidationError([
      createPatchIssueRequestValidationError({
        code: "patch.invalid_links",
        path: "/links",
        message,
      }),
    ]);
  }
}

function validatePatchIssueInput(
  input: Record<string, unknown>,
): void {
  const validationErrors = [
    ...createUnknownFieldValidationErrors(input),
    ...createImmutableFieldValidationErrors(input),
  ];

  if (!hasOwn(input, "expectedRevision")) {
    validationErrors.push(
      createPatchIssueRequestValidationError({
        code: "patch.expected_revision_required",
        path: "/expectedRevision",
        message: "Patch requests must include `expectedRevision`.",
      }),
    );
  } else if (
    typeof input.expectedRevision !== "string" ||
    input.expectedRevision.length === 0
  ) {
    validationErrors.push(
      createPatchIssueRequestValidationError({
        code: "patch.expected_revision_invalid",
        path: "/expectedRevision",
        message: "Patch `expectedRevision` must be a non-empty string.",
      }),
    );
  }

  if (hasOwn(input, "body") && typeof input.body !== "string") {
    validationErrors.push(
      createPatchIssueRequestValidationError({
        code: "patch.invalid_body",
        path: "/body",
        message: "Patch `body` must be a string when present.",
      }),
    );
  }

  if (validationErrors.length > 0) {
    throw new PatchIssueValidationError(validationErrors);
  }
}

function collectProvidedFields(
  input: Record<string, unknown>,
): ReadonlySet<MutablePatchFieldName> {
  return new Set(
    MUTABLE_PATCH_FIELD_NAMES.filter((fieldName) => hasOwn(input, fieldName)),
  );
}

export function normalizePatchIssueInput(
  input: PatchIssueInput,
): NormalizedPatchIssueInput {
  if (!isPlainObject(input)) {
    throw new PatchIssueValidationError([
      createPatchIssueRequestValidationError({
        code: "patch.invalid_request_body",
        path: "/",
        message: "Patch request body must be a JSON object.",
      }),
    ]);
  }

  validatePatchIssueInput(input);

  const providedFields = collectProvidedFields(input);

  if (providedFields.size === 0) {
    throw new PatchIssueValidationError([
      createPatchIssueRequestValidationError({
        code: "patch.no_changes_requested",
        path: "/",
        message:
          "Patch requests must include at least one mutable field in addition to `expectedRevision`.",
      }),
    ]);
  }

  return {
    expectedRevision: input.expectedRevision,
    ...(hasOwn(input, "title") ? { title: input.title } : {}),
    ...(hasOwn(input, "kind") ? { kind: input.kind } : {}),
    ...(hasOwn(input, "status") ? { status: input.status } : {}),
    ...(hasOwn(input, "resolution") ? { resolution: input.resolution } : {}),
    ...(hasOwn(input, "summary") ? { summary: input.summary } : {}),
    ...(hasOwn(input, "body") ? { body: input.body } : {}),
    ...(hasOwn(input, "priority") ? { priority: input.priority } : {}),
    ...(hasOwn(input, "labels") ? { labels: input.labels } : {}),
    ...(hasOwn(input, "assignees") ? { assignees: input.assignees } : {}),
    ...(hasOwn(input, "extensions") ? { extensions: input.extensions } : {}),
    ...(hasOwn(input, "links")
      ? { links: normalizePatchIssueLinks(input) }
      : {}),
    providedFields,
  };
}
