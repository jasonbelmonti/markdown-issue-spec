import { createNotImplementedHandler } from "./not-implemented.ts";

export const handlePatchIssue = createNotImplementedHandler({
  code: "issue_patch_not_implemented",
  endpoint: "PATCH /issues/:id",
});
