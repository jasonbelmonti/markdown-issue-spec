export interface Rfc3339SortKey {
  utcSecond: string;
  fractionalDigits: string;
}

interface ParsedRfc3339Timestamp {
  utcMillisecond: number;
  fractionalDigits: string;
}

const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/i;
const SORTABLE_UTC_YEAR_WIDTH = 6;

function createInvalidRfc3339TimestampError(timestamp: string): Error {
  return new Error(`RFC3339 timestamp "${timestamp}" is invalid.`);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

function assertRfc3339DateTimeFields(
  timestamp: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): void {
  if (month < 1 || month > 12) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }

  if (day < 1 || day > getDaysInMonth(year, month)) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }

  if (hour < 0 || hour > 23) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }

  if (minute < 0 || minute > 59) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }

  if (second < 0 || second > 59) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }
}

function assertRfc3339OffsetFields(
  timestamp: string,
  zoneDesignator: string,
  offsetHours: string | undefined,
  offsetMinutes: string | undefined,
): void {
  if (zoneDesignator.toUpperCase() === "Z") {
    return;
  }

  const parsedOffsetHours =
    offsetHours === undefined ? Number.NaN : Number.parseInt(offsetHours, 10);
  const parsedOffsetMinutes =
    offsetMinutes === undefined ? Number.NaN : Number.parseInt(offsetMinutes, 10);

  if (
    Number.isNaN(parsedOffsetHours)
    || Number.isNaN(parsedOffsetMinutes)
    || parsedOffsetHours < 0
    || parsedOffsetHours > 23
    || parsedOffsetMinutes < 0
    || parsedOffsetMinutes > 59
  ) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }
}

function normalizeFractionalDigits(fractionalDigits: string | undefined): string {
  if (fractionalDigits === undefined) {
    return "";
  }

  return fractionalDigits.replace(/0+$/u, "");
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function formatSortableUtcYear(year: number): string {
  if (year < 0) {
    return `-${padNumber(Math.abs(year), SORTABLE_UTC_YEAR_WIDTH)}`;
  }

  return padNumber(year, SORTABLE_UTC_YEAR_WIDTH);
}

function buildUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const date = new Date(0);

  date.setUTCHours(hour, minute, second, 0);
  date.setUTCFullYear(year, month - 1, day);

  return date;
}

function formatUtcSecond(utcMillisecond: number): string {
  const utcDate = new Date(utcMillisecond);

  return [
    formatSortableUtcYear(utcDate.getUTCFullYear()),
    "-",
    padNumber(utcDate.getUTCMonth() + 1, 2),
    "-",
    padNumber(utcDate.getUTCDate(), 2),
    "T",
    padNumber(utcDate.getUTCHours(), 2),
    ":",
    padNumber(utcDate.getUTCMinutes(), 2),
    ":",
    padNumber(utcDate.getUTCSeconds(), 2),
    "Z",
  ].join("");
}

function getOffsetMinutes(
  timestamp: string,
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
    throw createInvalidRfc3339TimestampError(timestamp);
  }

  const totalOffsetMinutes =
    Number.parseInt(offsetHours, 10) * 60
    + Number.parseInt(offsetMinutes, 10);

  return offsetSign === "+" ? totalOffsetMinutes : -totalOffsetMinutes;
}

function parseRfc3339Timestamp(timestamp: string): ParsedRfc3339Timestamp {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(timestamp);

  if (match == null) {
    throw createInvalidRfc3339TimestampError(timestamp);
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
  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = Number.parseInt(month, 10);
  const parsedDay = Number.parseInt(day, 10);
  const parsedHour = Number.parseInt(hour, 10);
  const parsedMinute = Number.parseInt(minute, 10);
  const parsedSecond = Number.parseInt(second, 10);

  assertRfc3339DateTimeFields(
    timestamp,
    parsedYear,
    parsedMonth,
    parsedDay,
    parsedHour,
    parsedMinute,
    parsedSecond,
  );
  assertRfc3339OffsetFields(
    timestamp,
    zoneDesignator,
    offsetHours,
    offsetMinutes,
  );

  const utcMillisecond =
    buildUtcDate(
      parsedYear,
      parsedMonth,
      parsedDay,
      parsedHour,
      parsedMinute,
      parsedSecond,
    ).getTime()
    - getOffsetMinutes(
      timestamp,
      zoneDesignator,
      offsetSign,
      offsetHours,
      offsetMinutes,
    ) * 60_000;

  if (Number.isNaN(utcMillisecond)) {
    throw createInvalidRfc3339TimestampError(timestamp);
  }

  return {
    utcMillisecond,
    fractionalDigits: normalizeFractionalDigits(fractionalDigits),
  };
}

export function normalizeRfc3339SortKey(timestamp: string): Rfc3339SortKey {
  const parsedTimestamp = parseRfc3339Timestamp(timestamp);

  return {
    utcSecond: formatUtcSecond(parsedTimestamp.utcMillisecond),
    fractionalDigits: parsedTimestamp.fractionalDigits,
  };
}
