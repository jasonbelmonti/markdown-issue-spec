export interface FinalizePersistedIssueMutationOptions<T> {
  persist: () => Promise<T>;
  rollback: () => Promise<void>;
  afterPersist?: () => Promise<void>;
}

export async function finalizePersistedIssueMutation<T>(
  options: FinalizePersistedIssueMutationOptions<T>,
): Promise<T> {
  const result = await options.persist();

  try {
    await options.afterPersist?.();
  } catch (error) {
    try {
      await options.rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Persisted issue mutation failed during post-persist processing and canonical rollback failed.",
      );
    }

    throw error;
  }

  return result;
}
