import type { Issue } from "../../core/types/index.ts";

export type CreateIssueInput = Omit<Issue, "id">;
