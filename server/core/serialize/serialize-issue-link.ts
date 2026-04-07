import type { IssueLink, IssueRef } from "../types/index.ts";

export function serializeIssueRef(
  target: IssueRef,
): string | Record<string, string> {
  if (
    target.href === undefined &&
    target.path === undefined &&
    target.title === undefined
  ) {
    return target.id;
  }

  const serializedTarget: Record<string, string> = {
    id: target.id,
  };

  if (target.href !== undefined) {
    serializedTarget.href = target.href;
  }

  if (target.path !== undefined) {
    serializedTarget.path = target.path;
  }

  if (target.title !== undefined) {
    serializedTarget.title = target.title;
  }

  return serializedTarget;
}

export function serializeIssueLink(link: IssueLink): Record<string, unknown> {
  const serializedLink: Record<string, unknown> = {
    rel: link.rel,
    target: serializeIssueRef(link.target),
  };

  if (link.rel === "depends_on") {
    serializedLink.required_before = link.required_before;
  }

  if (link.note !== undefined) {
    serializedLink.note = link.note;
  }

  if (link.extensions !== undefined) {
    serializedLink.extensions = link.extensions;
  }

  return serializedLink;
}
