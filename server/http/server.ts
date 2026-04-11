import { createApiError } from "./errors/api-error.ts";
import { createApiErrorResponse } from "./errors/error-response.ts";

export interface HttpServerOptions {
  hostname?: string;
  port?: number;
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

export function startServer(
  options: HttpServerOptions = {},
): Bun.Server {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME;
  const port = options.port ?? DEFAULT_PORT;

  const server = Bun.serve({
    hostname,
    port,
    fetch() {
      return createNotFoundResponse();
    },
  });

  console.log(
    `markdown-issue-spec server listening on http://${server.hostname}:${server.port}`,
  );

  return server;
}
