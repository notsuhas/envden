import { test, expect } from "bun:test";
import { emptyState } from "../../../../state/model.ts";
import { homePath } from "../../../home-path.ts";
import { joinSummary, setupSummary } from "../summary.ts";

test("home paths shorten only inside the home folder", () => {
  expect(homePath("/home/me", "/home/me")).toBe("~");
  expect(homePath("/home/me/app", "/home/me")).toBe("~/app");
  expect(homePath("/home/meow/app", "/home/me")).toBe("/home/meow/app");
  expect(homePath("/home/me/..env/app", "/home/me")).toBe("~/..env/app");
});

test("setup and join summaries name the device, server and synced files", () => {
  const state = emptyState("mainbook-2");
  state.server = { address: "https://envden.example.ts.net", pin: "", protocol: 1 };

  const [setup, next] = setupSummary(state, "/home/me");

  expect(setup).toContain("https://envden.example.ts.net");
  expect(setup).toContain("mainbook-2");
  expect(next).toContain("envden track");
  expect(joinSummary(state, "/home/me")[0]).toContain("mainbook-2");

  const link = { store: "/s", mode: "link" as const };
  state.links.push({ ...link, root: "/home/me/app", path: ".env" });
  state.links.push({ ...link, root: "/home/me/app", path: ".env.local", localOnly: true });

  expect(setupSummary(state, "/home/me")[0]).toContain("1 env file in ~/app");
  expect(joinSummary(state, "/home/me")[0]).toContain("1 env file in ~/app");

  for (const root of ["/srv/api", "/srv/web", "/srv/jobs"])
    state.links.push({ ...link, root, path: ".env" });

  expect(joinSummary(state, "/home/me")[0]).toContain("4 env files in 4 checkouts");
});
