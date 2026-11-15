import { expect, test } from "bun:test";
import { allowedHost, sameOrigin } from "../host.ts";

test.each([
  ["127.0.0.1:4100", true],
  ["localhost:4100", true],
  ["127.0.0.1:4101", false],
  ["127.0.0.1", false],
  ["evil.example:4100", false],
  ["[::1]:4100", false],
  ["LOCALHOST:4100", false],
  [undefined, false],
] as const)("host %p allowed %p", (host, allowed) => {
  expect(allowedHost(host, 4100)).toBe(allowed);
});

test.each([
  ["http://127.0.0.1:4100", "127.0.0.1:4100", true],
  ["http://localhost:4100", "localhost:4100", true],
  ["http://localhost:4100", "127.0.0.1:4100", false],
  ["https://127.0.0.1:4100", "127.0.0.1:4100", false],
  ["http://evil.example", "127.0.0.1:4100", false],
  ["null", "127.0.0.1:4100", false],
  [undefined, "127.0.0.1:4100", false],
] as const)("origin %p for host %p same %p", (origin, host, same) => {
  expect(sameOrigin(origin, host)).toBe(same);
});
