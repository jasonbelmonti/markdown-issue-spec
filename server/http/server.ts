import { defaultAdminHandlers } from "./handlers/default-admin-handlers.ts";
import { createApiError } from "./errors/api-error.ts";
import { createApiErrorResponse } from "./errors/error-response.ts";
import { defaultMutationHandlers } from "./handlers/default-mutation-handlers.ts";
import { defaultQueryHandlers } from "./handlers/default-query-handlers.ts";
import type {
  AdminRouteHandlers,
  MutationRouteHandlers,
  QueryRouteHandlers,
} from "./handlers/types.ts";
import type { HttpRouteDefinition } from "./route-contract.ts";
import { createAdminRouteDefinitions } from "./routes/admin-routes.ts";
import { isLoopbackHostname } from "./loopback-hostname.ts";
import { createMutationRouteDefinitions } from "./routes/mutation-routes.ts";
import { createQueryRouteDefinitions } from "./routes/query-routes.ts";

export interface HttpServerOptions {
  hostname?: string;
  port?: number;
  adminHandlers?: AdminRouteHandlers;
  mutationHandlers?: MutationRouteHandlers;
  queryHandlers?: QueryRouteHandlers;
}

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 3000;

function createNotFoundResponse(): Response {
  return createApiErrorResponse(
    createApiError({
      status: 404,
      code: "route_not_found",
      message: "No route matches the requested path.",
    }),
  );
}

function createBunRoutes(
  routeDefinitions: readonly HttpRouteDefinition[],
): Bun.Serve.Options["routes"] {
  const routes: NonNullable<Bun.Serve.Options["routes"]> = {};

  for (const routeDefinition of routeDefinitions) {
    const existingRoute = routes[routeDefinition.pathname];

    routes[routeDefinition.pathname] = {
      ...existingRoute,
      [routeDefinition.method]: routeDefinition.handler,
    };
  }

  return routes;
}

function resolveMutationHandlers(
  mutationHandlers: MutationRouteHandlers | undefined,
): MutationRouteHandlers {
  return mutationHandlers ?? defaultMutationHandlers;
}

function resolveAdminHandlers(
  adminHandlers: AdminRouteHandlers | undefined,
): AdminRouteHandlers {
  return adminHandlers ?? defaultAdminHandlers;
}

function resolveQueryHandlers(
  queryHandlers: QueryRouteHandlers | undefined,
): QueryRouteHandlers {
  return queryHandlers ?? defaultQueryHandlers;
}

export function startServer(
  options: HttpServerOptions = {},
): Bun.Server {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME;
  const port = options.port ?? DEFAULT_PORT;
  const routeDefinitions = [
    ...(isLoopbackHostname(hostname)
      ? createAdminRouteDefinitions(resolveAdminHandlers(options.adminHandlers))
      : []),
    ...createMutationRouteDefinitions(
      resolveMutationHandlers(options.mutationHandlers),
    ),
    ...createQueryRouteDefinitions(resolveQueryHandlers(options.queryHandlers)),
  ];
  const routes = createBunRoutes(routeDefinitions);

  const server = Bun.serve({
    hostname,
    port,
    routes,
    fetch() {
      return createNotFoundResponse();
    },
  });

  console.log(
    `markdown-issue-spec server listening on http://${server.hostname}:${server.port}`,
  );

  return server;
}
