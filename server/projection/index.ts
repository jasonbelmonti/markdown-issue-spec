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
export { readIssueEnvelope } from "./read-issue-envelope.ts";
export {
  listIssueEnvelopes,
  type ListIssueEnvelopesPage,
  type ListIssueEnvelopesQuery,
} from "./list-issue-envelopes.ts";
export {
  indexValidationErrors,
  type ValidationErrorIndexTarget,
} from "./index-validation-errors.ts";
export {
  listValidationErrors,
  type ListValidationErrorsQuery,
} from "./list-validation-errors.ts";
export {
  writeProjectionState,
  type ProjectionStateWriteInput,
} from "./write-projection-state.ts";
export {
  clearProjectionState,
  clearProjectionStateForFilePath,
} from "./clear-projection-state.ts";
export {
  replaceProjectionState,
  type ReplaceProjectionStateInput,
} from "./replace-projection-state.ts";
