import { expect, test } from "bun:test";

import { createQueryRouteDefinitions } from "./query-routes.ts";

test("createQueryRouteDefinitions returns the planned query route contract", () => {
  const getIssue = () => new Response("issue");
  const listIssues = () => new Response("issues");
  const listValidationErrors = () => new Response("validation-errors");

  expect(
    createQueryRouteDefinitions({
      getIssue,
      listIssues,
      listValidationErrors,
    }),
  ).toEqual([
    {
      pathname: "/issues/:id",
      method: "GET",
      handler: getIssue,
    },
    {
      pathname: "/issues",
      method: "GET",
      handler: listIssues,
    },
    {
      pathname: "/validation/errors",
      method: "GET",
      handler: listValidationErrors,
    },
  ]);
});
