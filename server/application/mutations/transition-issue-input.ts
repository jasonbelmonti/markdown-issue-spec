import type {
  IssueResolution,
  IssueRevision,
  IssueStatus,
} from "../../core/types/index.ts";

export interface TransitionIssueInput {
  expectedRevision: IssueRevision;
  to_status: IssueStatus;
  resolution?: IssueResolution;
}
