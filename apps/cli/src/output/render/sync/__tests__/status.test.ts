import { expect, test } from "bun:test";
import { NOT_SET_UP } from "../../../../state/configured.ts";
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

test("status sums up an in-sync vault in one line", () => {
  const synced = statusText(report([{ state: "in-sync" }, { state: "local-only" }]), place);

  expect(synced.split("\n")).toHaveLength(1);
  expect(synced).toContain("1 repo, 1 env file");
  expect(statusText(report([]), place)).toContain("envden track");
});

test("status lists each file once per action, with short paths", () => {
  const lines = statusText(
    report([
      { state: "diverged" },
      { root: "/home/me/api", state: "changed" },
      { root: "/srv/web", state: "remote" },
      { path: "a/.env", state: "conflict" },
      { path: "b/.env", state: "held-back", reason: "checkout needs approval" },
    ]),
    place,
  ).split("\n");

  expect(lines).toHaveLength(5);
  expect(lines[1]).toMatch(/envden push.*: \.env, ~\/api\/\.env$/);
  expect(lines[2]).toMatch(/envden pull.*: \.env, \/srv\/web\/\.env$/);
  expect(lines[3]).toMatch(/envden resolve.*: a\/\.env$/);
  expect(lines[4]).toMatch(/b\/\.env: checkout needs approval$/);
});

test("status without the server never claims to be in sync", () => {
  const offline = {
    ...report([{ state: "in-sync" }]),
    server: "unreachable",
    serverReason: "connection refused",
    serverChecked: false,
  } as Parameters<typeof statusText>[0];

  const text = statusText(offline, place);

  expect(text).toContain("unreachable (connection refused)");
  expect(text).not.toMatch(/in sync/i);
});

test("status without setup says how to start and keeps the update notice", () => {
  const text = statusText(
    { configured: false, update: { ...update, message: "Update available" } },
    place,
  );

  expect(text).toBe(`${NOT_SET_UP}\nUpdate available`);
});
