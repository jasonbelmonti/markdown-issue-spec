export interface FinalizePersistedIssueMutationOptions<T> {
  persist: () => Promise<T>;
  rollback: () => Promise<void>;
  afterPersist?: () => Promise<void>;
}

async function rollbackAndRethrow(
  rollback: () => Promise<void>,
  error: unknown,
): Promise<never> {
  try {
    await rollback();
  } catch (rollbackError) {
    throw new AggregateError(
      [error, rollbackError],
      "Persisted issue mutation failed and canonical rollback failed.",
    );
  }

  throw error;
}

export async function finalizePersistedIssueMutation<T>(
  options: FinalizePersistedIssueMutationOptions<T>,
): Promise<T> {
  let result: T;

  try {
    result = await options.persist();
  } catch (error) {
    return rollbackAndRethrow(options.rollback, error);
  }

  try {
    await options.afterPersist?.();
  } catch (error) {
    return rollbackAndRethrow(options.rollback, error);
  }

  return result;
}
