import { Buffer } from "node:buffer";

interface IssueListCursorPayload {
  v: number;
  utcSecond: string;
  fractionalDigits: string;
  issueId: string;
}

export interface IssueListCursor {
  utcSecond: string;
  fractionalDigits: string;
  issueId: string;
}

const ISSUE_LIST_CURSOR_VERSION = 2;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CURSOR_UTC_SECOND_PATTERN =
  /^-?\d{6}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CURSOR_FRACTIONAL_DIGITS_PATTERN = /^\d*$/;

function throwInvalidIssueListCursor(): never {
  throw new Error("Issue list cursor is invalid.");
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): string {
  if (value.length === 0 || !BASE64_URL_PATTERN.test(value)) {
    throwInvalidIssueListCursor();
  }

  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return Buffer.from(base64, "base64").toString("utf8");
}

function isIssueListCursorPayload(
  value: unknown,
): value is IssueListCursorPayload {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<IssueListCursorPayload>;

  return (
    payload.v === ISSUE_LIST_CURSOR_VERSION
    && typeof payload.utcSecond === "string"
    && CURSOR_UTC_SECOND_PATTERN.test(payload.utcSecond)
    && typeof payload.fractionalDigits === "string"
    && CURSOR_FRACTIONAL_DIGITS_PATTERN.test(payload.fractionalDigits)
    && typeof payload.issueId === "string"
    && payload.issueId.length > 0
  );
}

export function encodeIssueListCursor(cursor: IssueListCursor): string {
  return toBase64Url(
    JSON.stringify({
      v: ISSUE_LIST_CURSOR_VERSION,
      utcSecond: cursor.utcSecond,
      fractionalDigits: cursor.fractionalDigits,
      issueId: cursor.issueId,
    } satisfies IssueListCursorPayload),
  );
}

export function decodeIssueListCursor(cursor: string): IssueListCursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(fromBase64Url(cursor));
  } catch {
    throwInvalidIssueListCursor();
  }

  if (!isIssueListCursorPayload(parsed)) {
    throwInvalidIssueListCursor();
  }

  return {
    utcSecond: parsed.utcSecond,
    fractionalDigits: parsed.fractionalDigits,
    issueId: parsed.issueId,
  };
}
