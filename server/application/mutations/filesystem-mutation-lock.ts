export interface FilesystemMutationLock {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export function createFilesystemMutationLock(): FilesystemMutationLock {
  let currentLock: Promise<void> = Promise.resolve();

  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      let releaseLock!: () => void;
      const nextLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const previousLock = currentLock;

      currentLock = nextLock;
      await previousLock;

      try {
        return await work();
      } finally {
        releaseLock();

        if (currentLock === nextLock) {
          currentLock = Promise.resolve();
        }
      }
    },
  };
}
