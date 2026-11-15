import { expect, test } from "bun:test";
import page from "../../page/index.html";
import { pageAssets } from "../assets.ts";

test("the page bundles to external files with no inline script", async () => {
  const assets = await pageAssets(page);
  const html = new TextDecoder().decode(assets.get("/")!.body);
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];

  expect(scripts.length).toBeGreaterThan(0);

  for (const [tag, body] of scripts) {
    expect(body!.trim()).toBe("");
    const src = /src="\.?(\/[^"]+)"/.exec(tag)![1]!;
    expect(assets.get(src)?.type).toStartWith("text/javascript");
  }
});
