import type { ExtensionMap } from "./issue.ts";

export type DependencyRequiredBefore = "in_progress" | "completed";

export interface IssueRef {
  id: string;
  href?: string;
  path?: string;
  title?: string;
}

export interface IssueLink {
  rel: string;
  target: IssueRef;
  required_before?: DependencyRequiredBefore;
  note?: string;
  extensions?: ExtensionMap;
}
