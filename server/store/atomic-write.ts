import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";

export async function atomicWriteFile(
  filePath: string,
  contents: string,
): Promise<void> {
  const directoryPath = dirname(filePath);
  const temporaryFilePath = join(
    directoryPath,
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );

  await mkdir(directoryPath, { recursive: true });

  try {
    await writeFile(temporaryFilePath, contents);
    await rename(temporaryFilePath, filePath);
  } catch (error) {
    await rm(temporaryFilePath, { force: true }).catch(() => {});
    throw error;
  }
}
