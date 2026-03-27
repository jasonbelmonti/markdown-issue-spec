import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

interface SchemaValidator {
  validate(data: unknown): SchemaValidationResult;
}

const validatorCache = new Map<string, Promise<SchemaValidator>>();

export function loadSchemaValidator(repoRoot: string): Promise<SchemaValidator> {
  const cached = validatorCache.get(repoRoot);
  if (cached) {
    return cached;
  }

  const validatorPromise = createSchemaValidator(repoRoot);
  validatorCache.set(repoRoot, validatorPromise);
  return validatorPromise;
}

async function createSchemaValidator(repoRoot: string): Promise<SchemaValidator> {
  const schemaPath = path.join(
    repoRoot,
    "docs",
    "schemas",
    "markdown-frontmatter.schema.json",
  );
  const schemaSource = await readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaSource) as object;

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const validate = ajv.compile(schema);

  return {
    validate(data: unknown): SchemaValidationResult {
      const valid = validate(data);

      return {
        valid,
        errors: valid ? [] : formatAjvErrors(validate),
      };
    },
  };
}

function formatAjvErrors(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map((error) => formatAjvError(error));
}

function formatAjvError(error: ErrorObject): string {
  const location = error.instancePath || "/";

  if (error.keyword === "additionalProperties") {
    const extraProperty = String(error.params.additionalProperty);
    return `${location} must not include ${extraProperty}`;
  }

  return `${location} ${error.message ?? "is invalid"}`;
}
