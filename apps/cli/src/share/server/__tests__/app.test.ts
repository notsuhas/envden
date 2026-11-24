import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import page from "../../page/index.html";
import { createShareApp } from "../app.ts";
import { claimAnswer } from "../lifecycle.ts";
import { sharePage } from "../page.ts";

test("only the first claim before expiry gets the file", () => {
  for (const [claimed, now, kind] of [
    [false, 999, "file"],
    [false, 1000, "expired"],
    [true, 0, "already-opened"],
  ] as const)
    expect(claimAnswer({ claimed, expiresAt: 1000 }, now).kind).toBe(kind);
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

test("viewing never burns the link; the file goes out once, and nothing else is served", async () => {
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
