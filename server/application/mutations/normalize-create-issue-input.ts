import { normalizeIssueLinks } from "../../core/parser/index.ts";
import type { IssueLink } from "../../core/types/index.ts";
import type { CreateIssueInput } from "./create-issue-input.ts";
import { createCreateIssueRequestValidationFailure } from "./create-issue-validation-error.ts";

export interface NormalizedCreateIssueInput extends CreateIssueInput {
  body?: string;
  links?: IssueLink[];
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNormalizedLinkErrorIndex(message: string): number | undefined {
  const normalizedLinkMatch = /^Failed to normalize link at index (\d+): /.exec(message);

  if (normalizedLinkMatch === null) {
    return undefined;
  }

  return Number(normalizedLinkMatch[1]);
}

function normalizeCreateIssueLinks(input: Record<string, unknown>): IssueLink[] | undefined {
  if (!hasOwn(input, "links")) {
    return undefined;
  }

  try {
    return normalizeIssueLinks(input.links);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const linkIndex = parseNormalizedLinkErrorIndex(message);

    throw createCreateIssueRequestValidationFailure({
      code: "create.invalid_links",
      path: linkIndex === undefined ? "/links" : `/links/${linkIndex}`,
      message,
      ...(linkIndex === undefined ? {} : { details: { index: linkIndex } }),
    });
  }
}

export function normalizeCreateIssueInput(
  input: CreateIssueInput,
): NormalizedCreateIssueInput {
  if (!isPlainObject(input)) {
    throw createCreateIssueRequestValidationFailure({
      code: "create.invalid_payload",
      path: "/",
      message: "Create issue input must be a JSON object.",
    });
  }

  if (hasOwn(input, "body") && typeof input.body !== "string") {
    throw createCreateIssueRequestValidationFailure({
      code: "create.invalid_body",
      path: "/body",
      message: "Create `body` must be a string when present.",
    });
  }

  return {
    ...input,
    ...(hasOwn(input, "links")
      ? { links: normalizeCreateIssueLinks(input) }
      : {}),
  };
}
