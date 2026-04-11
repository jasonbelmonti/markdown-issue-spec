export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue | undefined };
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

function createJsonHeaders(headers: HeadersInit | undefined): Headers {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return responseHeaders;
}

export function jsonResponse(
  body: JsonValue,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: createJsonHeaders(init.headers),
  });
}
