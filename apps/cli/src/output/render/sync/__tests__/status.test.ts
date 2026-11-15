import { expect, test } from "bun:test";
import { statusText } from "../status.ts";

const place = { cwd: "/home/me/app", userHome: "/home/me" };
const update = { available: false, required: false };

function report(files: { root?: string; path?: string; state: string; reason?: string }[]) {
  return {
    configured: true as const,
    vaultId: "VAULT",
    server: "reachable",
    serverChecked: true,
    files: files.map((file) => ({ root: "/home/me/app", path: ".env", repoId: "repo", ...file })),
    update,
  } as Parameters<typeof statusText>[0];
}

test("status says in sync in one line", () => {
  expect(statusText(report([{ state: "in-sync" }, { state: "local-only" }]), place)).toBe(
    "In sync: 1 repo, 1 env file. Server reachable.",
  );

  expect(statusText(report([]), place)).toBe(
    "Nothing tracked yet. Run envden track in a checkout.",
  );
});

test("status lists each file once per action, with short paths", () => {
  expect(
    statusText(
      report([
        { state: "diverged" },
        { root: "/home/me/api", state: "changed" },
        { root: "/srv/web", state: "remote" },
        { path: "a/.env", state: "conflict" },
        { path: "b/.env", state: "held-back", reason: "checkout needs approval; run envden track" },
      ]),
      place,
    ),
  ).toBe(
    [
      "Server: reachable",
      "Changed here (run envden push): .env, ~/api/.env",
      "Newer on server (run envden pull): .env, /srv/web/.env",
      "Conflicts (run envden resolve --list): a/.env",
      "Held back: b/.env: checkout needs approval; run envden track",
    ].join("\n"),
  );
});

test("status without the server never claims to be in sync", () => {
  const offline = {
    ...report([{ state: "in-sync" }]),
    server: "unreachable",
    serverReason: "connection refused",
    serverChecked: false,
  } as Parameters<typeof statusText>[0];

  expect(statusText(offline, place)).toBe(
    "Server: unreachable (connection refused)\nNo changes here",
  );
});

test("status without setup says how to start", () => {
  expect(
    statusText({ configured: false, update: { ...update, message: "Update available" } }, place),
  ).toBe("Not set up yet. Run envden setup or envden join\nUpdate available");
});
