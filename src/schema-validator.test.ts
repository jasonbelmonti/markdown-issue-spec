import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSchemaValidator } from "./schema-validator.ts";

const repoRoot = path.resolve(import.meta.dir, "..");

describe.serial("schema-validator", () => {
  test("recovers after an initial missing-schema failure once the schema file exists", async () => {
    const tempRepo = await mkdtemp(path.join(os.tmpdir(), "markdown-issue-spec-schema-"));

    try {
      const firstAttempt = await loadSchemaValidator(tempRepo).then(
        () => null,
        (error) => error,
      );
      expect(firstAttempt).toBeInstanceOf(Error);

      await mkdir(path.join(tempRepo, "docs", "schemas"), { recursive: true });
      await copyFile(
        path.join(repoRoot, "docs", "schemas", "markdown-frontmatter.schema.json"),
        path.join(tempRepo, "docs", "schemas", "markdown-frontmatter.schema.json"),
      );

      const validator = await loadSchemaValidator(tempRepo);
      const validation = validator.validate({
        spec_version: "mis/0.1",
        id: "ISSUE-6000",
        title: "Recovered schema load",
        kind: "task",
        status: "proposed",
        created_at: "2026-03-22T10:24:00-05:00",
      });

      expect(validation.valid).toBe(true);
    } finally {
      await rm(tempRepo, { recursive: true, force: true });
    }
  });
});
