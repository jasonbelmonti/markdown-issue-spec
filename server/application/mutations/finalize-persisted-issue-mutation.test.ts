import { expect, test } from "bun:test";

import { finalizePersistedIssueMutation } from "./finalize-persisted-issue-mutation.ts";

test("finalizePersistedIssueMutation rolls back when persist fails after mutating state", async () => {
  let canonicalState = "original";
  let rollbackCallCount = 0;

  await expect(
    finalizePersistedIssueMutation({
      persist: async () => {
        canonicalState = "written";
        throw new Error("persist failed");
      },
      rollback: async () => {
        rollbackCallCount += 1;
        canonicalState = "original";
      },
    }),
  ).rejects.toThrow("persist failed");

  expect(rollbackCallCount).toBe(1);
  expect(canonicalState).toBe("original");
});

test("finalizePersistedIssueMutation aggregates persist failures with rollback failures", async () => {
  await expect(
    finalizePersistedIssueMutation({
      persist: async () => {
        throw new Error("persist failed");
      },
      rollback: async () => {
        throw new Error("rollback failed");
      },
    }),
  ).rejects.toThrow(
    "Persisted issue mutation failed and canonical rollback failed.",
  );
});
