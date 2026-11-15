import { expect, test } from "bun:test";
import { serveConflict } from "../conflict.ts";

const host = "laptop.tail.example";
const port = 4280;
const target = `http://127.0.0.1:${port}`;

const site = (handlers: Record<string, { Proxy?: string }>, address = `${host}:${port}`) =>
  JSON.stringify({ TCP: { [port]: { HTTPS: true } }, Web: { [address]: { Handlers: handlers } } });

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
  ["raw TCP forward", JSON.stringify({ TCP: { [port]: { TCPForward: "127.0.0.1:22" } } }), true],
  ["listener without a site", JSON.stringify({ TCP: { [port]: { HTTPS: true } } }), true],
  [
    "another app on 443",
    JSON.stringify({
      TCP: { "443": { HTTPS: true } },
      Web: { [`${host}:443`]: { Handlers: { "/": { Proxy: "http://127.0.0.1:3773" } } } },
    }),
    false,
  ],
] as const)
  test(`serve on its own port: ${name}`, () => {
    expect(serveConflict(stdout, host, port, target)).toBe(conflict);
  });

test("unreadable serve status is refused", () => {
  expect(() => serveConflict("bad json", host, port, target)).toThrow(
    expect.objectContaining({ code: "INVALID_DATA" }),
  );
});
