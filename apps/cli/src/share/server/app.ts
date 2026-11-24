import { Hono } from "hono";
import { shareAnswer, type IShareState } from "./lifecycle.ts";
import type { ISharePage } from "./page.ts";

interface IShareApp {
  id: string;
  box: Uint8Array;
  page: ISharePage;
  state: IShareState;
  now: () => number;
  claimed: () => void;
}

function headers(csp: string): Record<string, string> {
  return {
    "Content-Security-Policy": csp,
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

// Serves only /s/<id>; Funnel forwards nothing else, and the listener answers nothing else either.
export function createShareApp(share: IShareApp) {
  const { id, box, page, state, now, claimed } = share;

  return new Hono()
    .use("*", async (c, next) => {
      await next();

      for (const [name, value] of Object.entries(headers(page.csp))) c.res.headers.set(name, value);
    })
    .get(`/s/${id}`, (c) => c.html(page.html))
    .post(`/s/${id}/claim`, (c) => {
      const answer = shareAnswer("claim", state, now());

      if (answer.kind === "already-opened") return c.text("Already opened", 410);

      if (answer.kind !== "file") return c.text("Expired", 404);

      state.claimed = true;
      claimed();

      return c.body(box.slice().buffer, 200, {
        "Content-Type": "application/octet-stream",
        Connection: "close",
      });
    })
    .all("*", (c) => c.text("Not found", 404));
}
