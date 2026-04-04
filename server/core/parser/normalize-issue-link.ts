import type {
  CustomIssueLink,
  CustomIssueRelation,
  DependencyIssueLink,
  DependencyRequiredBefore,
  IssueLink,
  IssueRef,
  NonDependencyCoreIssueRelation,
  NonDependencyCoreIssueLink,
} from "../types/index.ts";
import {
  isCoreIssueRelation,
  isCustomIssueRelation,
} from "../types/index.ts";
import {
  isPlainObject,
  readOptionalExtensionMap,
  readOptionalString,
  readRequiredString,
} from "./record-helpers.ts";

const DEPENDENCY_REQUIRED_BEFORE_VALUES = [
  "in_progress",
  "completed",
] as const satisfies readonly DependencyRequiredBefore[];

function readRequiredBefore(
  record: Record<string, unknown>,
): DependencyRequiredBefore {
  const value = readRequiredString(record, "required_before");

  if (
    !(
      DEPENDENCY_REQUIRED_BEFORE_VALUES as readonly string[]
    ).includes(value)
  ) {
    throw new Error(
      "Expected `required_before` to be `in_progress` or `completed`.",
    );
  }

  return value as DependencyRequiredBefore;
}

function assertRequiredBeforeUsage(
  record: Record<string, unknown>,
  rel: string,
): void {
  if (rel !== "depends_on" && "required_before" in record) {
    throw new Error("Only `depends_on` links may declare `required_before`.");
  }
}

export function normalizeIssueRef(target: unknown): IssueRef {
  if (typeof target === "string") {
    return { id: target };
  }

  if (!isPlainObject(target)) {
    throw new Error("Expected link `target` to be a string or object.");
  }

  const href = readOptionalString(target, "href");
  const path = readOptionalString(target, "path");
  const title = readOptionalString(target, "title");

  return {
    id: readRequiredString(target, "id"),
    ...(href === undefined ? {} : { href }),
    ...(path === undefined ? {} : { path }),
    ...(title === undefined ? {} : { title }),
  };
}

export function normalizeIssueLink(link: unknown): IssueLink {
  if (!isPlainObject(link)) {
    throw new Error("Expected each link to be an object.");
  }

  const rel = readRequiredString(link, "rel");
  const target = normalizeIssueRef(link.target);
  const note = readOptionalString(link, "note");
  const extensions = readOptionalExtensionMap(link, "extensions");

  assertRequiredBeforeUsage(link, rel);

  if (rel === "depends_on") {
    const dependencyLink: DependencyIssueLink = {
      rel,
      target,
      required_before: readRequiredBefore(link),
      ...(note === undefined ? {} : { note }),
      ...(extensions === undefined ? {} : { extensions }),
    };

    return dependencyLink;
  }

  if (isCoreIssueRelation(rel)) {
    const coreLink: NonDependencyCoreIssueLink = {
      rel: rel as NonDependencyCoreIssueRelation,
      target,
      ...(note === undefined ? {} : { note }),
      ...(extensions === undefined ? {} : { extensions }),
    };

    return coreLink;
  }

  if (isCustomIssueRelation(rel)) {
    const customLink: CustomIssueLink = {
      rel: rel as CustomIssueRelation,
      target,
      ...(note === undefined ? {} : { note }),
      ...(extensions === undefined ? {} : { extensions }),
    };

    return customLink;
  }

  throw new Error(`Unsupported link relation: ${rel}`);
}

export function normalizeIssueLinks(links: unknown): IssueLink[] | undefined {
  if (links === undefined) {
    return undefined;
  }

  if (!Array.isArray(links)) {
    throw new Error("Expected `links` to be an array when present.");
  }

  return links.map((link, index) => {
    try {
      return normalizeIssueLink(link);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to normalize link at index ${index}: ${message}`);
    }
  });
}
