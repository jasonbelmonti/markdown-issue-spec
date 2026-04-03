import type { ExtensionMap } from "./issue.ts";

export type DependencyRequiredBefore = "in_progress" | "completed";

export type CoreIssueRelation =
  | "parent"
  | "depends_on"
  | "duplicate_of"
  | "related_to"
  | "references";

// Custom relation names are modeled as namespaced strings so they stay distinct
// from the core vocabulary while still leaving room for extensions.
export type CustomIssueRelation =
  | `${string}/${string}`
  | `${string}:${string}`
  | `${string}.${string}`;

export type NonDependencyIssueRelation =
  | Exclude<CoreIssueRelation, "depends_on">
  | CustomIssueRelation;

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

export interface NonDependencyIssueLink extends IssueLinkBase {
  rel: NonDependencyIssueRelation;
  required_before?: never;
}

export type IssueLink = DependencyIssueLink | NonDependencyIssueLink;
