import { expect, test } from "bun:test";

import { createMutationRouteDefinitions } from "./mutation-routes.ts";

test("createMutationRouteDefinitions returns the planned mutation route contract", () => {
  const createIssue = () => new Response("create");
  const patchIssue = () => new Response("patch");
  const transitionIssue = () => new Response("transition");

  expect(
    createMutationRouteDefinitions({
      createIssue,
      patchIssue,
      transitionIssue,
    }),
  ).toEqual([
    {
      pathname: "/issues",
      method: "POST",
      handler: createIssue,
    },
    {
      pathname: "/issues/:id",
      method: "PATCH",
      handler: patchIssue,
    },
    {
      pathname: "/issues/:id/transition",
      method: "POST",
      handler: transitionIssue,
    },
  ]);
});
