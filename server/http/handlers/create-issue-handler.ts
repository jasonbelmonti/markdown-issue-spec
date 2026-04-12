import { createNotImplementedHandler } from "./not-implemented.ts";

export const handleCreateIssue = createNotImplementedHandler({
  code: "issue_create_not_implemented",
  endpoint: "POST /issues",
});
