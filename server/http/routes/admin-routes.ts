import type { AdminRouteHandlers } from "../handlers/types.ts";
import type { HttpRouteDefinition } from "../route-contract.ts";

export function createAdminRouteDefinitions(
  handlers: AdminRouteHandlers,
): readonly HttpRouteDefinition[] {
  return [
    {
      pathname: "/admin/rebuild-index",
      method: "POST",
      handler: handlers.rebuildIndex,
    },
  ];
}
