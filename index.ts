import { startServer } from "./server/http/server.ts";

function readOptionalEnvironmentVariable(name: string): string | undefined {
  const value = Bun.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function resolvePortFromEnvironment(): number | undefined {
  const port = readOptionalEnvironmentVariable("MIS_PORT");

  if (port === undefined) {
    return undefined;
  }

  const parsedPort = Number(port);

  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
    throw new Error(
      `MIS_PORT must be an integer between 0 and 65535. Received "${port}".`,
    );
  }

  return parsedPort;
}

startServer({
  hostname: readOptionalEnvironmentVariable("MIS_HOSTNAME"),
  port: resolvePortFromEnvironment(),
});
