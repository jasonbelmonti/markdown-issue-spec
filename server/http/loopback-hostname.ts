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

export function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  if (normalizedHostname === "localhost" || normalizedHostname === "::1") {
    return true;
  }

  if (isIP(normalizedHostname) !== 4) {
    return false;
  }

  return isLoopbackIpv4(normalizedHostname);
}
