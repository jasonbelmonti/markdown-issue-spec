import type { FrontmatterValidationError } from "./types.ts";
import { isLinkTargetPath } from "./schema-error-paths.ts";

function compareValidationErrors(
  left: FrontmatterValidationError,
  right: FrontmatterValidationError,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function hasMoreSpecificErrorForPath(
  errors: readonly FrontmatterValidationError[],
  path: string,
): boolean {
  return errors.some((error) =>
    error.path === path || error.path.startsWith(`${path}/`)
  );
}

function shouldKeepSchemaError(
  error: FrontmatterValidationError,
  otherErrors: readonly FrontmatterValidationError[],
): boolean {
  if (
    error.code === "schema.oneOf" ||
    error.code === "schema.anyOf" ||
    error.code === "schema.if"
  ) {
    return !hasMoreSpecificErrorForPath(otherErrors, error.path);
  }

  if (error.code === "schema.type" && isLinkTargetPath(error.path)) {
    return !hasMoreSpecificErrorForPath(otherErrors, error.path);
  }

  return true;
}

export function finalizeSchemaErrors(
  errors: readonly FrontmatterValidationError[],
): FrontmatterValidationError[] {
  const sortedErrors = [...errors].sort(compareValidationErrors);

  return sortedErrors.filter((error, index) => {
    const otherErrors = sortedErrors.filter((_, otherIndex) => otherIndex !== index);
    return shouldKeepSchemaError(error, otherErrors);
  });
}
