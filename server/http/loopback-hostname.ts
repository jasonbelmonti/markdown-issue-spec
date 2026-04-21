import { isIP } from "node:net";

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }

  return hostname;
}

function isLoopbackIpv4(hostname: string): boolean {
  const octets = hostname.split(".");

  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet)) &&
    Number(octets[0]) === 127 &&
    octets.every((octet) => {
      const value = Number(octet);

      return value >= 0 && value <= 255;
    })
  );
}

function expandIpv6Address(hostname: string): string[] | null {
  if (hostname.includes(".")) {
    return null;
  }

  const doubleColonIndex = hostname.indexOf("::");

  if (doubleColonIndex !== hostname.lastIndexOf("::")) {
    return null;
  }

  const [head, tail] =
    doubleColonIndex === -1
      ? [hostname, undefined]
      : hostname.split("::");
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === undefined || tail === "" ? [] : tail.split(":");

  const parts = [...headParts, ...tailParts];

  if (
    parts.some(
      (part) =>
        part === "" ||
        !/^[0-9a-fA-F]{1,4}$/.test(part),
    )
  ) {
    return null;
  }

  if (doubleColonIndex === -1) {
    return parts.length === 8 ? parts : null;
  }

  const zeroFillCount = 8 - parts.length;

  if (zeroFillCount < 1) {
    return null;
  }

  return [
    ...headParts,
    ...Array.from({ length: zeroFillCount }, () => "0"),
    ...tailParts,
  ];
}

function isLoopbackIpv6(hostname: string): boolean {
  const parts = expandIpv6Address(hostname);

  if (parts === null || parts.length !== 8) {
    return false;
  }

  const values = parts.map((part) => Number.parseInt(part, 16));

  return values.slice(0, 7).every((value) => value === 0) && values[7] === 1;
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  if (normalizedHostname === "localhost" || normalizedHostname === "::1") {
    return true;
  }

  const ipVersion = isIP(normalizedHostname);

  if (ipVersion === 4) {
    return isLoopbackIpv4(normalizedHostname);
  }

  if (ipVersion === 6) {
    return isLoopbackIpv6(normalizedHostname);
  }

  return false;
}
