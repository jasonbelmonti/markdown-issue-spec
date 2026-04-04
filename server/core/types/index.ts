export type {
  CanceledIssue,
  CanceledIssueResolution,
  CompletedIssue,
  CompletedIssueResolution,
  ExtensionMap,
  ExtensionValue,
  Issue,
  IssueResolution,
  IssueSpecVersion,
  IssueStatus,
  NonTerminalIssue,
  NonTerminalIssueStatus,
  Rfc3339Timestamp,
  TerminalIssue,
  TerminalIssueStatus,
} from "./issue.ts";
export type {
  CoreIssueLink,
  CoreIssueRelation,
  CustomIssueLink,
  CustomIssueRelation,
  DependencyIssueLink,
  DependencyRequiredBefore,
  IssueLink,
  IssueRef,
  NonDependencyCoreIssueLink,
  NonDependencyCoreIssueRelation,
} from "./link.ts";
export {
  CORE_ISSUE_RELATIONS,
  isCoreIssueRelation,
  isCustomIssueRelation,
} from "./link.ts";
