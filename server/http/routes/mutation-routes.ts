import type { MutationRouteHandlers } from "../handlers/types.ts";
import type { HttpRouteDefinition } from "../route-contract.ts";

export function createMutationRouteDefinitions(
  handlers: MutationRouteHandlers,
): readonly HttpRouteDefinition[] {
  return [
    {
      pathname: "/issues",
      method: "POST",
      handler: handlers.createIssue,
    },
    {
      pathname: "/issues/:id",
      method: "PATCH",
      handler: handlers.patchIssue,
    },
    {
      pathname: "/issues/:id/transition",
      method: "POST",
      handler: handlers.transitionIssue,
    },
  ];
}
