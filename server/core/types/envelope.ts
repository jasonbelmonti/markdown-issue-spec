import type { Issue, Rfc3339Timestamp } from "./issue.ts";

export type IssueRevision = string;

export interface DerivedIssueFields {
  children_ids: string[];
  blocks_ids: string[];
  blocked_by_ids: string[];
  duplicates_ids: string[];
  ready: boolean;
  is_blocked: boolean;
}

export interface IssueSource {
  file_path: string;
  indexed_at: Rfc3339Timestamp;
}

export interface IssueEnvelope {
  issue: Issue;
  derived: DerivedIssueFields;
  revision: IssueRevision;
  source: IssueSource;
}
