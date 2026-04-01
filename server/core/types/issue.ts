import type { IssueLink } from "./link.ts";

export type IssueSpecVersion = "mis/0.1";

export type IssueStatus =
  | "proposed"
  | "accepted"
  | "in_progress"
  | "completed"
  | "canceled";

export type IssueResolution =
  | "done"
  | "duplicate"
  | "obsolete"
  | "wont_do"
  | "superseded";

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

export interface Issue {
  spec_version: IssueSpecVersion;
  id: string;
  title: string;
  kind: string;
  status: IssueStatus;
  created_at: Rfc3339Timestamp;
  updated_at?: Rfc3339Timestamp;
  resolution?: IssueResolution;
  summary?: string;
  body?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  links?: IssueLink[];
  extensions?: ExtensionMap;
}
