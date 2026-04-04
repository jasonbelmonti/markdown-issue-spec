import type { IssueLink } from "./link.ts";

export type IssueSpecVersion = "mis/0.1";

export type IssueStatus =
  | "proposed"
  | "accepted"
  | "in_progress"
  | "completed"
  | "canceled";

export type NonTerminalIssueStatus = Exclude<
  IssueStatus,
  "completed" | "canceled"
>;

export type TerminalIssueStatus = Extract<
  IssueStatus,
  "completed" | "canceled"
>;

export type IssueResolution =
  | "done"
  | "duplicate"
  | "obsolete"
  | "wont_do"
  | "superseded";

export type CompletedIssueResolution = Extract<IssueResolution, "done">;

export type CanceledIssueResolution = Exclude<IssueResolution, "done">;

export type Rfc3339Timestamp = string;

export type ExtensionValue =
  | string
  | number
  | boolean
  | null
  | ExtensionMap
  | ExtensionValue[];

// Extensions stay open and recursive so later slices can carry namespaced data
// without reshaping the canonical issue surface.
export interface ExtensionMap {
  [key: string]: ExtensionValue;
}

interface IssueBase {
  spec_version: IssueSpecVersion;
  id: string;
  title: string;
  kind: string;
  created_at: Rfc3339Timestamp;
  updated_at?: Rfc3339Timestamp;
  summary?: string;
  body?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  links?: IssueLink[];
  extensions?: ExtensionMap;
}

export interface NonTerminalIssue extends IssueBase {
  status: NonTerminalIssueStatus;
  resolution?: never;
}

export interface CompletedIssue extends IssueBase {
  status: "completed";
  resolution: CompletedIssueResolution;
}

export interface CanceledIssue extends IssueBase {
  status: "canceled";
  resolution: CanceledIssueResolution;
}

export type TerminalIssue = CompletedIssue | CanceledIssue;

export type Issue = NonTerminalIssue | TerminalIssue;
