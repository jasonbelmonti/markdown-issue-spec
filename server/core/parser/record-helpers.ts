import type { ExtensionMap } from "../types/index.ts";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertNonEmptyString(value: string, context: string): string {
  if (value.length === 0) {
    throw new Error(`Expected ${context} to be a non-empty string.`);
  }

  return value;
}

export function readRequiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new Error(`Expected \`${key}\` to be a string.`);
  }

  return assertNonEmptyString(value, `\`${key}\``);
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Expected \`${key}\` to be a string when present.`);
  }

  return value;
}

export function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Expected \`${key}\` to be an array of strings when present.`);
  }

  return [...value];
}

export function readOptionalExtensionMap(
  record: Record<string, unknown>,
  key: string,
): ExtensionMap | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Expected \`${key}\` to be an object when present.`);
  }

  return value as ExtensionMap;
}
