import type { ErrorObject } from "ajv/dist/2020.js";

import type { FrontmatterValidationError } from "./types.ts";
import {
  appendJsonPointer,
  isLinkPath,
  isLinkTargetPath,
  readPointerFieldName,
} from "./schema-error-paths.ts";

function createSchemaError(
  error: ErrorObject,
  code: string,
  path: string,
  message: string,
  details: Record<string, unknown> = {},
): FrontmatterValidationError {
  return {
    code,
    source: "schema",
    path,
    message,
    details: {
      keyword: error.keyword,
      schemaPath: error.schemaPath,
      ...details,
    },
  };
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function readValueAtJsonPointer(
  document: unknown,
  path: string,
): unknown {
  if (path.length === 0) {
    return document;
  }

  let currentValue: unknown = document;

  for (const rawSegment of path.split("/").filter(Boolean)) {
    const segment = decodeJsonPointerSegment(rawSegment);

    if (Array.isArray(currentValue)) {
      const index = Number(segment);

      if (!Number.isInteger(index)) {
        return undefined;
      }

      currentValue = currentValue[index];
      continue;
    }

    if (
      currentValue === null ||
      typeof currentValue !== "object" ||
      !(segment in currentValue)
    ) {
      return undefined;
    }

    currentValue = (currentValue as Record<string, unknown>)[segment];
  }

  return currentValue;
}

function createGenericSchemaError(error: ErrorObject): FrontmatterValidationError {
  const message =
    error.message === undefined
      ? "Frontmatter does not satisfy the markdown frontmatter schema."
      : `Schema validation failed: ${error.message}.`;

  return createSchemaError(error, `schema.${error.keyword}`, error.instancePath, message);
}

function mapAdditionalPropertiesError(
  error: ErrorObject,
): FrontmatterValidationError {
  const property = String(
    (error.params as { additionalProperty: string }).additionalProperty,
  );
  const path = appendJsonPointer(error.instancePath, property);

  if (error.instancePath.length === 0) {
    return createSchemaError(
      error,
      "schema.additional_properties",
      path,
      `Unexpected frontmatter field: ${property}.`,
      { property },
    );
  }

  if (isLinkPath(error.instancePath)) {
    return createSchemaError(
      error,
      "schema.additional_properties",
      path,
      `Unexpected link field: ${property}.`,
      { property },
    );
  }

  if (isLinkTargetPath(error.instancePath)) {
    return createSchemaError(
      error,
      "schema.additional_properties",
      path,
      `Unexpected link target field: ${property}.`,
      { property },
    );
  }

  return createSchemaError(
    error,
    "schema.additional_properties",
    path,
    `Unexpected field: ${property}.`,
    { property },
  );
}

function mapRequiredError(error: ErrorObject): FrontmatterValidationError {
  const property = String((error.params as { missingProperty: string }).missingProperty);
  const path = appendJsonPointer(error.instancePath, property);

  if (error.instancePath.length === 0) {
    return createSchemaError(
      error,
      "schema.required",
      path,
      `Missing required frontmatter field: ${property}.`,
      { property },
    );
  }

  if (isLinkPath(error.instancePath) && property === "required_before") {
    return createSchemaError(
      error,
      "schema.required",
      path,
      "Dependency links must declare `required_before`.",
      { property },
    );
  }

  return createSchemaError(
    error,
    "schema.required",
    path,
    `Missing required field: ${property}.`,
    { property },
  );
}

function mapTypeError(error: ErrorObject): FrontmatterValidationError {
  const expectedType = String((error.params as { type: string }).type);

  if (isLinkTargetPath(error.instancePath)) {
    return createSchemaError(
      error,
      "schema.type",
      error.instancePath,
      "Expected link `target` to be a string or object.",
      { expectedType },
    );
  }

  const fieldName = readPointerFieldName(error.instancePath);

  if (fieldName === undefined) {
    return createGenericSchemaError(error);
  }

  const article = expectedType === "array" ? "an" : "a";

  return createSchemaError(
    error,
    "schema.type",
    error.instancePath,
    `Expected \`${fieldName}\` to be ${article} ${expectedType}.`,
    { expectedType },
  );
}

function mapMinLengthError(error: ErrorObject): FrontmatterValidationError {
  if (isLinkTargetPath(error.instancePath)) {
    return createSchemaError(
      error,
      "schema.min_length",
      error.instancePath,
      "Expected shorthand link `target` to be a non-empty string.",
    );
  }

  const fieldName = readPointerFieldName(error.instancePath);

  if (fieldName === undefined) {
    return createGenericSchemaError(error);
  }

  return createSchemaError(
    error,
    "schema.min_length",
    error.instancePath,
    `Expected \`${fieldName}\` to be a non-empty string.`,
  );
}

function mapFormatError(error: ErrorObject): FrontmatterValidationError {
  const format = String((error.params as { format: string }).format);
  const fieldName = readPointerFieldName(error.instancePath);

  if (format !== "date-time" || fieldName === undefined) {
    return createGenericSchemaError(error);
  }

  return createSchemaError(
    error,
    "schema.format",
    error.instancePath,
    `Expected \`${fieldName}\` to be an RFC 3339 date-time string.`,
    { format },
  );
}

function mapEnumError(error: ErrorObject): FrontmatterValidationError {
  const fieldName = readPointerFieldName(error.instancePath);

  if (fieldName === undefined) {
    return createGenericSchemaError(error);
  }

  const allowedValues = [
    ...(error.params as { allowedValues: readonly unknown[] }).allowedValues,
  ];

  return createSchemaError(
    error,
    "schema.enum",
    error.instancePath,
    `Expected \`${fieldName}\` to be one of: ${allowedValues.join(", ")}.`,
    { allowedValues },
  );
}

function mapConstError(
  error: ErrorObject,
  frontmatter: Record<string, unknown>,
): FrontmatterValidationError {
  const fieldName = readPointerFieldName(error.instancePath);
  const allowedValue = (error.params as { allowedValue: unknown }).allowedValue;
  const actualValue = readValueAtJsonPointer(frontmatter, error.instancePath);

  if (fieldName === "spec_version") {
    return createSchemaError(
      error,
      "schema.const",
      error.instancePath,
      `Unsupported issue spec version: ${String(actualValue)}`,
      {
        allowedValue,
        actualValue,
      },
    );
  }

  if (fieldName === undefined) {
    return createGenericSchemaError(error);
  }

  return createSchemaError(
    error,
    "schema.const",
    error.instancePath,
    `Expected \`${fieldName}\` to equal ${String(allowedValue)}.`,
    { allowedValue },
  );
}

function mapNotError(error: ErrorObject): FrontmatterValidationError {
  if (
    isLinkPath(error.instancePath) &&
    error.schemaPath.endsWith("/else/not")
  ) {
    return createSchemaError(
      error,
      "schema.not",
      appendJsonPointer(error.instancePath, "required_before"),
      "Only `depends_on` links may declare `required_before`.",
    );
  }

  return createGenericSchemaError(error);
}

export function mapSchemaError(
  error: ErrorObject,
  frontmatter: Record<string, unknown>,
): FrontmatterValidationError {
  switch (error.keyword) {
    case "additionalProperties":
      return mapAdditionalPropertiesError(error);
    case "required":
      return mapRequiredError(error);
    case "type":
      return mapTypeError(error);
    case "minLength":
      return mapMinLengthError(error);
    case "format":
      return mapFormatError(error);
    case "enum":
      return mapEnumError(error);
    case "const":
      return mapConstError(error, frontmatter);
    case "not":
      return mapNotError(error);
    default:
      return createGenericSchemaError(error);
  }
}
