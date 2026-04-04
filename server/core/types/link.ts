import type { ExtensionMap } from "./issue.ts";

export type DependencyRequiredBefore = "in_progress" | "completed";

export type CoreIssueRelation =
  | "parent"
  | "depends_on"
  | "duplicate_of"
  | "related_to"
  | "references";

declare const customIssueRelationBrand: unique symbol;

export const CORE_ISSUE_RELATIONS = [
  "parent",
  "depends_on",
  "duplicate_of",
  "related_to",
  "references",
] as const satisfies readonly CoreIssueRelation[];

// A branded custom relation keeps "depends_on" out of the custom branch while
// still allowing parser code to safely narrow arbitrary input strings.
export type CustomIssueRelation = string & {
  readonly [customIssueRelationBrand]: "CustomIssueRelation";
};

export type NonDependencyCoreIssueRelation = Exclude<
  CoreIssueRelation,
  "depends_on"
>;

export function isCoreIssueRelation(value: string): value is CoreIssueRelation {
  return (
    CORE_ISSUE_RELATIONS as readonly string[]
  ).includes(value);
}

export function isCustomIssueRelation(
  value: string,
): value is CustomIssueRelation {
  return !isCoreIssueRelation(value);
}

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
// relations are branded and narrowed through `isCustomIssueRelation`.
export interface CustomIssueLink extends IssueLinkBase {
  rel: CustomIssueRelation;
  required_before?: never;
}

export type CoreIssueLink = DependencyIssueLink | NonDependencyCoreIssueLink;

export type IssueLink = CoreIssueLink | CustomIssueLink;
