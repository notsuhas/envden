import { expect, test } from "bun:test";
import { serveConflict } from "../conflict.ts";

const host = "laptop.tail.example";
const target = "http://127.0.0.1:4280";

const site = (handlers: Record<string, { Proxy?: string }>, address = `${host}:443`) =>
  JSON.stringify({ TCP: { "443": { HTTPS: true } }, Web: { [address]: { Handlers: handlers } } });

for (const [name, stdout, conflict] of [
  ["nothing served", "{}", false],
  ["empty output", "", false],
  ["null output", "null", false],
  ["same target", site({ "/": { Proxy: target } }), false],
  [
    "other port only on another host",
    JSON.stringify({
      Web: { "x.tail.example:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:1" } } } },
    }),
    false,
  ],
  ["different target", site({ "/": { Proxy: "http://127.0.0.1:3000" } }), true],
  ["extra path", site({ "/": { Proxy: target }, "/app": { Proxy: target } }), true],
  ["raw TCP forward", JSON.stringify({ TCP: { "443": { TCPForward: "127.0.0.1:22" } } }), true],
  ["listener without a site", JSON.stringify({ TCP: { "443": { HTTPS: true } } }), true],
] as const)
  test(`serve on 443: ${name}`, () => {
    expect(serveConflict(stdout, host, target)).toBe(conflict);
  });

test("unreadable serve status is refused", () => {
  expect(() => serveConflict("bad json", host, target)).toThrow("Invalid Tailscale serve status");
});
