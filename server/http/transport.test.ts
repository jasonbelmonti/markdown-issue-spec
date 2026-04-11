import { expect, test } from "bun:test";

import { createApiError } from "./errors/api-error.ts";
import { createApiErrorResponse } from "./errors/error-response.ts";
import { parseJsonBody } from "./request/parse-json-body.ts";
import { jsonResponse } from "./response/json.ts";

test("jsonResponse serializes JSON bodies with the default content type", async () => {
  const response = jsonResponse({ ok: true }, { status: 202 });

  expect(response.status).toBe(202);
  expect(response.headers.get("content-type")).toBe(
    "application/json; charset=utf-8",
  );
  expect(await response.json()).toEqual({ ok: true });
});

test("parseJsonBody parses valid JSON requests", async () => {
  const request = new Request("http://localhost/issues", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "Bootstrap the transport layer",
    }),
  });

  expect(await parseJsonBody<{ title: string }>(request)).toEqual({
    title: "Bootstrap the transport layer",
  });
});

test("parseJsonBody rejects non-json content types with a machine-readable error", async () => {
  const request = new Request("http://localhost/issues", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
    },
    body: "hello",
  });

  await expect(parseJsonBody(request)).rejects.toMatchObject({
    status: 415,
    code: "unsupported_media_type",
    message: "Request body must use application/json.",
    details: {
      contentType: "text/plain",
    },
  });
});

test("parseJsonBody rejects lookalike non-json media types", async () => {
  const request = new Request("http://localhost/issues", {
    method: "POST",
    headers: {
      "content-type": "application/jsonp",
    },
    body: JSON.stringify({
      title: "No sneaking JSONP through the side door",
    }),
  });

  await expect(parseJsonBody(request)).rejects.toMatchObject({
    status: 415,
    code: "unsupported_media_type",
    message: "Request body must use application/json.",
    details: {
      contentType: "application/jsonp",
    },
  });
});

test("parseJsonBody accepts json content types with optional whitespace before parameters", async () => {
  const request = new Request("http://localhost/issues", {
    method: "POST",
    headers: {
      "content-type": "application/json ; charset=utf-8",
    },
    body: JSON.stringify({
      title: "Whitespace happens",
    }),
  });

  expect(await parseJsonBody<{ title: string }>(request)).toEqual({
    title: "Whitespace happens",
  });
});

test("parseJsonBody rejects malformed JSON with a machine-readable error", async () => {
  const request = new Request("http://localhost/issues", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{",
  });

  await expect(parseJsonBody(request)).rejects.toMatchObject({
    status: 400,
    code: "invalid_json_body",
    message: "Request body must contain valid JSON.",
  });
});

test("createApiErrorResponse serializes api errors as deterministic JSON", async () => {
  const response = createApiErrorResponse(
    createApiError({
      status: 409,
      code: "revision_mismatch",
      message: "The issue revision does not match the expected revision.",
      details: {
        issueId: "ISSUE-1234",
      },
    }),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: {
      code: "revision_mismatch",
      message: "The issue revision does not match the expected revision.",
      details: {
        issueId: "ISSUE-1234",
      },
    },
  });
});

test("createApiErrorResponse normalizes unexpected errors to internal_server_error", async () => {
  const response = createApiErrorResponse(new Error("kaboom"));

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: {
      code: "internal_server_error",
      message: "The server failed to process the request.",
    },
  });
});
