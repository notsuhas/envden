import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import page from "../../page/index.html";
import { createShareApp } from "../app.ts";
import { shareAnswer } from "../lifecycle.ts";
import { sharePage } from "../page.ts";

test("only the first claim before expiry gets the file; viewing never burns it", () => {
  const fresh = { claimed: false, expiresAt: 1000 };
  const claimed = { claimed: true, expiresAt: 1000 };

  for (const [action, state, now, kind] of [
    ["view", fresh, 0, "page"],
    ["view", claimed, 0, "page"],
    ["view", fresh, 1000, "page"],
    ["claim", fresh, 999, "file"],
    ["claim", fresh, 1000, "expired"],
    ["claim", claimed, 0, "already-opened"],
  ] as const)
    expect(shareAnswer(action, state, now).kind).toBe(kind);
});

test("the page is one self-contained document whose CSP pins its inline code", async () => {
  const { html, csp } = await sharePage(page);
  const inline = [...html.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)];

  expect(new Set(inline.map(([, tag]) => tag))).toEqual(new Set(["script", "style"]));
  expect(html).not.toMatch(/\b(src|href)=/);
  expect(csp).toStartWith("default-src 'none'");

  for (const [, , body] of inline)
    expect(csp).toContain(`'sha256-${createHash("sha256").update(body!).digest("base64")}'`);
});

test("the listener serves the page, hands the file out once, and nothing else", async () => {
  const box = new Uint8Array([1, 2, 3]);
  const state = { claimed: false, expiresAt: 1000 };
  let now = 0;
  let claims = 0;

  const app = createShareApp({
    id: "abc",
    box,
    page: { html: "<p>page</p>", csp: "default-src 'none'" },
    state,
    now: () => now,
    claimed: () => claims++,
  });

  const view = () => app.request("/s/abc");
  const claim = () => app.request("/s/abc/claim", { method: "POST" });

  expect((await view()).status).toBe(200);

  const first = await claim();
  expect([first.status, new Uint8Array(await first.arrayBuffer())]).toEqual([200, box]);
  expect([(await claim()).status, (await view()).status, claims]).toEqual([410, 200, 1]);

  for (const header of [
    "Content-Security-Policy",
    "Referrer-Policy",
    "Cache-Control",
    "X-Robots-Tag",
  ])
    expect(first.headers.get(header)).toBeTruthy();

  for (const [path, method] of [
    ["/s/other/claim", "POST"],
    ["/s/abc/claim", "GET"],
    ["/", "GET"],
  ] as const)
    expect((await app.request(path, { method })).status).toBe(404);

  state.claimed = false;
  now = 1000;
  expect((await claim()).status).toBe(404);
});
