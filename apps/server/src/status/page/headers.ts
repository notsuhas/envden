import { sha256 } from "@envden/core/protocol";
import { style } from "./style.ts";

const styleHash = Buffer.from(sha256(new TextEncoder().encode(style))).toString("base64");

export const statusHeaders = {
  "Content-Security-Policy": `default-src 'none'; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};
