export interface FilesystemIssueMutationLock {
  current: Promise<void>;
}

export function createFilesystemIssueMutationLock(): FilesystemIssueMutationLock {
  return {
    current: Promise.resolve(),
  };
}

export async function withFilesystemIssueMutationLock<T>(
  mutationLock: FilesystemIssueMutationLock,
  run: () => Promise<T>,
): Promise<T> {
  let releaseLock!: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const previousLock = mutationLock.current;

  mutationLock.current = nextLock;
  await previousLock;

  try {
    return await run();
  } finally {
    releaseLock();

    if (mutationLock.current === nextLock) {
      mutationLock.current = Promise.resolve();
    }
  }
}
