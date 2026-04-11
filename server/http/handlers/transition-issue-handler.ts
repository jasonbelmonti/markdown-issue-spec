import { createNotImplementedHandler } from "./not-implemented.ts";

export const handleTransitionIssue = createNotImplementedHandler({
  code: "issue_transition_not_implemented",
  endpoint: "POST /issues/:id/transition",
});
