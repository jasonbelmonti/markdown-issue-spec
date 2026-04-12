import type {
  ExtensionMap,
  IssueLink,
  IssueResolution,
  IssueRevision,
  IssueStatus,
} from "../../core/types/index.ts";

export interface PatchIssueInput {
  expectedRevision: IssueRevision;
  title?: string;
  kind?: string;
  status?: IssueStatus;
  resolution?: IssueResolution;
  summary?: string;
  body?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  links?: IssueLink[];
  extensions?: ExtensionMap;
}
