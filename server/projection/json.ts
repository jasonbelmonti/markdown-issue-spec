export function serializeProjectionJson(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

export function deserializeProjectionJson<T>(
  value: string | null | undefined,
): T | null {
  if (value == null) {
    return null;
  }

  return JSON.parse(value) as T;
}

export function deserializeProjectionJsonOrDefault<T>(
  value: string | null | undefined,
  defaultValue: T,
): T | null {
  if (value == null) {
    return defaultValue;
  }

  return deserializeProjectionJson<T>(value);
}
