import type { ExtensionMap } from "./issue.ts";

export type DependencyRequiredBefore = "in_progress" | "completed";

export type CoreIssueRelation =
  | "parent"
  | "depends_on"
  | "duplicate_of"
  | "related_to"
  | "references";

// mis/0.1 recommends namespacing custom relations, but it does not require it.
// Keep the custom side fully open so parser/validator code can represent any
// spec-valid input, including legacy or local relation labels.
export type CustomIssueRelation = string;

export type NonDependencyCoreIssueRelation = Exclude<
  CoreIssueRelation,
  "depends_on"
>;

export interface IssueRef {
  id: string;
  href?: string;
  path?: string;
  title?: string;
}

interface IssueLinkBase {
  target: IssueRef;
  note?: string;
  extensions?: ExtensionMap;
}

export interface DependencyIssueLink extends IssueLinkBase {
  rel: "depends_on";
  required_before: DependencyRequiredBefore;
}

export interface NonDependencyCoreIssueLink extends IssueLinkBase {
  rel: NonDependencyCoreIssueRelation;
  required_before?: never;
}

// TypeScript cannot precisely model "any string except depends_on", so custom
// relations remain open here while the core relation union stays strict.
export interface CustomIssueLink extends IssueLinkBase {
  rel: CustomIssueRelation;
  required_before?: never;
}

export type CoreIssueLink = DependencyIssueLink | NonDependencyCoreIssueLink;

export type IssueLink = CoreIssueLink | CustomIssueLink;
