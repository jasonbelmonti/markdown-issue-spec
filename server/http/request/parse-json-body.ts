import { createApiError } from "../errors/api-error.ts";

function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  const normalizedContentType = contentType.toLowerCase().trim();

  return (
    normalizedContentType === "application/json" ||
    normalizedContentType.startsWith("application/json;")
  );
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type");

  if (!isJsonContentType(contentType)) {
    throw createApiError({
      status: 415,
      code: "unsupported_media_type",
      message: "Request body must use application/json.",
      details: {
        contentType,
      },
    });
  }

  const rawBody = await request.text();

  if (rawBody.trim().length === 0) {
    throw createApiError({
      status: 400,
      code: "invalid_json_body",
      message: "Request body must not be empty.",
    });
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch (error) {
    throw createApiError({
      status: 400,
      code: "invalid_json_body",
      message: "Request body must contain valid JSON.",
      details: {
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
