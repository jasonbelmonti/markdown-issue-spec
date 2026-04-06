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

function hasDescendantErrorForPath(
  errors: readonly FrontmatterValidationError[],
  path: string,
): boolean {
  return errors.some((error) =>
    error.path.startsWith(`${path}/`)
  );
}

function hasOtherErrorAtPath(
  errors: readonly FrontmatterValidationError[],
  path: string,
): boolean {
  return errors.some((error) => error.path === path);
}

function isGenericSchemaError(error: FrontmatterValidationError): boolean {
  return (
    error.code === "schema.oneOf" ||
    error.code === "schema.anyOf" ||
    error.code === "schema.if"
  );
}

function isEquivalentSchemaError(
  left: FrontmatterValidationError,
  right: FrontmatterValidationError,
): boolean {
  return (
    left.code === right.code &&
    left.path === right.path &&
    left.message === right.message
  );
}

function shouldKeepSchemaError(
  error: FrontmatterValidationError,
  otherErrors: readonly FrontmatterValidationError[],
): boolean {
  if (otherErrors.some((otherError) => isEquivalentSchemaError(error, otherError))) {
    return false;
  }

  if (isGenericSchemaError(error)) {
    return !(
      hasOtherErrorAtPath(otherErrors, error.path) ||
      hasDescendantErrorForPath(otherErrors, error.path)
    );
  }

  if (error.code === "schema.type" && isLinkTargetPath(error.path)) {
    return !hasDescendantErrorForPath(otherErrors, error.path);
  }

  return true;
}

export function finalizeSchemaErrors(
  errors: readonly FrontmatterValidationError[],
): FrontmatterValidationError[] {
  const sortedErrors = [...errors].sort(compareValidationErrors);

  return sortedErrors.filter((error, index) => {
    const otherErrors = sortedErrors.slice(index + 1);
    return shouldKeepSchemaError(error, otherErrors);
  });
}
