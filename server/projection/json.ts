export function serializeProjectionJson(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}
