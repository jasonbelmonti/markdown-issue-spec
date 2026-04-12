import { readFileSync } from "node:fs";

import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { finalizeSchemaErrors } from "./schema-error-filtering.ts";
import { mapSchemaError } from "./schema-error-mapping.ts";
import type { FrontmatterValidationError } from "./types.ts";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

addFormats(ajv);

const markdownFrontmatterSchema = JSON.parse(
  readFileSync(
    new URL("../../../docs/schemas/markdown-frontmatter.schema.json", import.meta.url),
    "utf8",
  ),
) as object;

const validateMarkdownFrontmatterDocument = ajv.compile<Record<string, unknown>>(
  markdownFrontmatterSchema,
);

export function validateMarkdownFrontmatterSchema(
  frontmatter: Record<string, unknown>,
): FrontmatterValidationError[] {
  const valid = validateMarkdownFrontmatterDocument(frontmatter);

  if (valid) {
    return [];
  }

  return finalizeSchemaErrors(
    (validateMarkdownFrontmatterDocument.errors ?? []).map((error: ErrorObject) =>
      mapSchemaError(error, frontmatter),
    ),
  );
}
