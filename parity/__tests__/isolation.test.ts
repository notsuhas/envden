import { expect, test } from "bun:test";
import { deriveIsolation, skipReason, type ITailscaleCandidate } from "../isolation/tailscale.ts";
import { isolate } from "../isolation/probe.ts";

const local: ITailscaleCandidate = { path: "/usr/local/bin/tailscale", binary: "real" };
const app: ITailscaleCandidate = { path: "/Applications/Tailscale.app", binary: "real" };
const standIn: ITailscaleCandidate = { path: "/usr/bin/tailscale", binary: "stand-in" };
const missing: ITailscaleCandidate = { path: "/usr/bin/tailscale" };

test.each([
  [
    "mac with a real tailscale",
    "darwin",
    true,
    [missing, local, app],
    "blocked",
    [missing.path, local.path, app.path],
  ],
  ["mac CI with the stand-in", "darwin", true, [standIn, app], "stand-in", [app.path]],
  ["mac without tailscale", "darwin", true, [missing], "absent", [missing.path]],
  ["linux with a real tailscale", "linux", false, [standIn, local], "unsafe", undefined],
  [
    "linux CI with the stand-in",
    "linux",
    false,
    [standIn, { path: "/snap/bin/tailscale" }],
    "stand-in",
    undefined,
  ],
  ["linux without tailscale", "linux", false, [missing], "absent", undefined],
] as const)("%s", (_, platform, sandbox, candidates, tailscale, deny) => {
  const isolation = deriveIsolation({ platform, sandbox, candidates: [...candidates] });

  expect(isolation.tailscale).toBe(tailscale);
  expect(isolation.deny).toEqual(deny ? [...deny] : undefined);
});

test("only the stand-in runs tailscale-dependent scenarios; unsafe hosts skip doctor too", () => {
  expect(skipReason({ tailscale: "stand-in" }, "stand-in")).toBeUndefined();
  expect(skipReason({ tailscale: "blocked", deny: [] }, "stand-in")).toBeString();
  expect(skipReason({ tailscale: "blocked", deny: [] }, "isolated")).toBeUndefined();
  expect(skipReason({ tailscale: "absent" }, "isolated")).toBeUndefined();
  expect(skipReason({ tailscale: "unsafe" }, "isolated")).toBeString();
});

test("sandboxed commands deny every listed path", () => {
  const argv = isolate(["envden", "doctor"], {
    tailscale: "blocked",
    deny: [local.path, app.path],
  });

  expect(argv[0]).toBe("/usr/bin/sandbox-exec");

  expect(argv[2]).toContain(
    '(deny process-exec (subpath "/usr/local/bin/tailscale") (subpath "/Applications/Tailscale.app"))',
  );

  expect(argv.slice(3)).toEqual(["envden", "doctor"]);
  expect(isolate(["envden"], { tailscale: "absent" })).toEqual(["envden"]);
});
