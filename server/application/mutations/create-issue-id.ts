import { monotonicFactory } from "ulid";

const nextUlid = monotonicFactory();

export function createIssueId(): string {
  return `ISSUE-${nextUlid()}`;
}
