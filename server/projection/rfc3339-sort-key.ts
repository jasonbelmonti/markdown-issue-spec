export interface Rfc3339SortKey {
  utcSecond: string;
  fractionalDigits: string;
}

const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/i;

function normalizeFractionalDigits(fractionalDigits: string | undefined): string {
  if (fractionalDigits === undefined) {
    return "";
  }

  return fractionalDigits.replace(/0+$/u, "");
}

function formatUtcSecond(utcMillisecond: number): string {
  const isoTimestamp = new Date(utcMillisecond).toISOString();

  return `${isoTimestamp.slice(0, 19)}Z`;
}

function getOffsetMinutes(
  zoneDesignator: string,
  offsetSign: string | undefined,
  offsetHours: string | undefined,
  offsetMinutes: string | undefined,
): number {
  if (zoneDesignator.toUpperCase() === "Z") {
    return 0;
  }

  if (
    offsetSign === undefined
    || offsetHours === undefined
    || offsetMinutes === undefined
  ) {
    throw new Error("RFC3339 timestamp is invalid.");
  }

  const totalOffsetMinutes =
    Number.parseInt(offsetHours, 10) * 60
    + Number.parseInt(offsetMinutes, 10);

  return offsetSign === "+" ? totalOffsetMinutes : -totalOffsetMinutes;
}

export function normalizeRfc3339SortKey(timestamp: string): Rfc3339SortKey {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(timestamp);

  if (match == null) {
    throw new Error(`RFC3339 timestamp "${timestamp}" is invalid.`);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fractionalDigits,
    zoneDesignator,
    offsetSign,
    offsetHours,
    offsetMinutes,
  ] = match;
  const utcMillisecond =
    Date.UTC(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      Number.parseInt(hour, 10),
      Number.parseInt(minute, 10),
      Number.parseInt(second, 10),
    )
    - getOffsetMinutes(
      zoneDesignator,
      offsetSign,
      offsetHours,
      offsetMinutes,
    ) * 60_000;

  if (Number.isNaN(utcMillisecond)) {
    throw new Error(`RFC3339 timestamp "${timestamp}" is invalid.`);
  }

  return {
    utcSecond: formatUtcSecond(utcMillisecond),
    fractionalDigits: normalizeFractionalDigits(fractionalDigits),
  };
}

function compareLexicographically(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function compareFractionalDigits(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);

  return compareLexicographically(
    left.padEnd(maxLength, "0"),
    right.padEnd(maxLength, "0"),
  );
}

export function compareRfc3339SortKeys(
  left: Rfc3339SortKey,
  right: Rfc3339SortKey,
): number {
  const secondComparison = compareLexicographically(
    left.utcSecond,
    right.utcSecond,
  );

  if (secondComparison !== 0) {
    return secondComparison;
  }

  return compareFractionalDigits(
    left.fractionalDigits,
    right.fractionalDigits,
  );
}
