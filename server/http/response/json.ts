export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue | undefined };
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

function createJsonHeaders(headers: ResponseInit["headers"]): Headers {
  const responseHeaders = new Headers(headers as ConstructorParameters<typeof Headers>[0]);

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return responseHeaders;
}

export function jsonResponse<T>(
  body: T,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: createJsonHeaders(init.headers),
  });
}
