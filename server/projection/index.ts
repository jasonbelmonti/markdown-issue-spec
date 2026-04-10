export {
  openProjectionDatabase,
  type OpenProjectionDatabaseOptions,
} from "./db.ts";
export {
  applyProjectionSchema,
  PROJECTION_SCHEMA_VERSION,
  PROJECTION_TABLE_NAMES,
} from "./schema.ts";
export { indexIssueEnvelope } from "./index-issue.ts";
export {
  indexValidationErrors,
  type ValidationErrorIndexTarget,
} from "./index-validation-errors.ts";
export {
  writeProjectionState,
  type ProjectionStateWriteInput,
} from "./write-projection-state.ts";
