import type { QueryRouteHandlers } from "../handlers/types.ts";
import type { HttpRouteDefinition } from "../route-contract.ts";

export function createQueryRouteDefinitions(
  handlers: QueryRouteHandlers,
): readonly HttpRouteDefinition[] {
  return [
    {
      pathname: "/issues/:id",
      method: "GET",
      handler: handlers.getIssue,
    },
    {
      pathname: "/issues",
      method: "GET",
      handler: handlers.listIssues,
    },
    {
      pathname: "/validation/errors",
      method: "GET",
      handler: handlers.listValidationErrors,
    },
  ];
}
