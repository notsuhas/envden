import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { HTMLBundle } from "bun";
import { EnvdenError } from "@envden/core/errors";
import { pageAssets, type IPageAsset } from "../../ui/server/assets.ts";

export interface ISharePage {
  html: string;
  csp: string;
}

const SCRIPT = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;

const STYLESHEET = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g;

// One self-contained document: the page makes no request but its claim, and the CSP pins its code.
export async function sharePage(bundle: HTMLBundle): Promise<ISharePage> {
  const assets = await pageAssets(bundle);
  const scripts: string[] = [];
  const styles: string[] = [];

  const html = text(assets, "/")
    .replace(SCRIPT, (_tag, src: string) => inline(scripts, "script", text(assets, src)))
    .replace(STYLESHEET, (_tag, href: string) => inline(styles, "style", text(assets, href)));

  const csp = [
    "default-src 'none'",
    `script-src ${scripts.join(" ")}`,
    `style-src ${styles.join(" ")}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  return { html, csp };
}

function text(assets: Map<string, IPageAsset>, path: string): string {
  const asset = assets.get(path === "/" ? "/" : `/${basename(path)}`);
  if (!asset) throw new EnvdenError("INTERNAL", "Share page asset missing");

  return new TextDecoder().decode(asset.body);
}

function inline(hashes: string[], tag: "script" | "style", body: string): string {
  if (body.toLowerCase().includes(`</${tag}`))
    throw new EnvdenError("INTERNAL", "Share page can't be inlined");

  hashes.push(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);

  return tag === "script" ? `<script type="module">${body}</script>` : `<style>${body}</style>`;
}
