import { Buffer } from "node:buffer";

import { expect, test } from "bun:test";

import {
  decodeIssueListCursor,
  encodeIssueListCursor,
} from "./issue-list-cursor.ts";

function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

test("issue list cursors round-trip through the opaque codec", () => {
  const encodedCursor = encodeIssueListCursor({
    utcSecond: "002026-04-19T22:30:00Z",
    fractionalDigits: "00035",
    issueId: "ISSUE-2502",
  });

  expect(decodeIssueListCursor(encodedCursor)).toEqual({
    utcSecond: "002026-04-19T22:30:00Z",
    fractionalDigits: "00035",
    issueId: "ISSUE-2502",
  });
});

test("issue list cursors reject malformed timestamp payload fields", () => {
  const malformedCursor = toBase64UrlJson({
    v: 2,
    utcSecond: "A",
    fractionalDigits: "not-digits",
    issueId: "ISSUE-9999",
  });

  expect(() => decodeIssueListCursor(malformedCursor)).toThrow(
    "Issue list cursor is invalid.",
  );
});
