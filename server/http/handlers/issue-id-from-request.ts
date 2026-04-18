import type { HttpRouteRequest } from "./types.ts";

export function getIssueIdFromRequest(
  request: HttpRouteRequest,
  trailingPathSegmentsAfterId = 0,
): string {
  if (request.params?.id !== undefined) {
    return request.params.id;
  }

  const pathname = new URL(request.url).pathname;
  const encodedIssueId =
    pathname.split("/").at(-(trailingPathSegmentsAfterId + 1)) ?? "";

  try {
    return decodeURIComponent(encodedIssueId);
  } catch {
    return encodedIssueId;
  }
}
