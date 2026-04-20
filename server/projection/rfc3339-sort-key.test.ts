import { expect, test } from "bun:test";

import { normalizeRfc3339SortKey } from "./rfc3339-sort-key.ts";

test("normalizeRfc3339SortKey normalizes offsets while preserving precise fractional digits", () => {
  expect(normalizeRfc3339SortKey("2026-04-19T23:00:00.123456+02:00")).toEqual({
    utcSecond: "002026-04-19T21:00:00Z",
    fractionalDigits: "123456",
  });
});

test("normalizeRfc3339SortKey rejects out-of-range RFC3339 date-time fields", () => {
  expect(() =>
    normalizeRfc3339SortKey("2026-13-99T99:99:99Z")
  ).toThrow('RFC3339 timestamp "2026-13-99T99:99:99Z" is invalid.');
  expect(() =>
    normalizeRfc3339SortKey("2026-02-29T12:00:00Z")
  ).toThrow('RFC3339 timestamp "2026-02-29T12:00:00Z" is invalid.');
  expect(() =>
    normalizeRfc3339SortKey("2026-04-19T22:30:00+24:00")
  ).toThrow('RFC3339 timestamp "2026-04-19T22:30:00+24:00" is invalid.');
  expect(() =>
    normalizeRfc3339SortKey("2026-04-19T22:30:00+02:60")
  ).toThrow('RFC3339 timestamp "2026-04-19T22:30:00+02:60" is invalid.');
});

test("normalizeRfc3339SortKey preserves schema-valid years below 0100", () => {
  expect(normalizeRfc3339SortKey("0099-04-19T22:30:00Z")).toEqual({
    utcSecond: "000099-04-19T22:30:00Z",
    fractionalDigits: "",
  });
});

test("normalizeRfc3339SortKey distinguishes extended UTC years after offset normalization", () => {
  expect(normalizeRfc3339SortKey("9999-12-31T23:59:58-23:59")).toEqual({
    utcSecond: "010000-01-01T23:58:58Z",
    fractionalDigits: "",
  });
  expect(normalizeRfc3339SortKey("9999-12-31T23:59:59-23:59")).toEqual({
    utcSecond: "010000-01-01T23:58:59Z",
    fractionalDigits: "",
  });
});
