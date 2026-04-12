import type {
  CanceledIssue,
  CompletedIssue,
  NonTerminalIssue,
} from "../../core/types/index.ts";

export type CreateIssueInput =
  | Omit<NonTerminalIssue, "id">
  | Omit<CompletedIssue, "id">
  | Omit<CanceledIssue, "id">;
