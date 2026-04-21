import { expect, test } from "bun:test";

import { isLoopbackHostname } from "./loopback-hostname.ts";

test("isLoopbackHostname recognizes localhost and IPv6 loopback forms", () => {
  expect(isLoopbackHostname("localhost")).toBe(true);
  expect(isLoopbackHostname("::1")).toBe(true);
  expect(isLoopbackHostname("[::1]")).toBe(true);
});

test("isLoopbackHostname recognizes all 127/8 IPv4 loopback addresses", () => {
  expect(isLoopbackHostname("127.0.0.1")).toBe(true);
  expect(isLoopbackHostname("127.0.0.2")).toBe(true);
  expect(isLoopbackHostname("127.255.255.255")).toBe(true);
});

test("isLoopbackHostname rejects non-loopback hostnames and addresses", () => {
  expect(isLoopbackHostname("0.0.0.0")).toBe(false);
  expect(isLoopbackHostname("192.168.1.10")).toBe(false);
  expect(isLoopbackHostname("example.com")).toBe(false);
  expect(isLoopbackHostname("::2")).toBe(false);
});
