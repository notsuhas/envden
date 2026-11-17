import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { syncFixture } from "../../../sync/__tests__/flows.ts";
import { loadState, saveState } from "../../../state/store/repository.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { pull } from "../../../sync/engine.ts";
import { dashboardClient } from "./client.ts";

const restore = { root: "/x", path: ".env", version: 1 };
const secrets = ["local-test-value", "server-only-secret", "mine-only-secret"];

let fixture: Awaited<ReturnType<typeof syncFixture>>;

let client: ReturnType<typeof dashboardClient>;

beforeAll(async () => {
  fixture = await syncFixture();
  client = dashboardClient(fixture.now);
});

afterAll(async () => {
  await fixture.cleanup();
});

const app = (adapters: typeof fixture.first) => client.app(adapters);
const send = (...args: Parameters<typeof client.send>) => client.send(...args);

test.each([
  ["missing token", "/api/status", { Authorization: "" }, undefined, 401],
  ["wrong token", "/api/status", { Authorization: "Bearer nope" }, undefined, 401],
  ["rebound host", "/api/status", { Host: "evil.example:4100" }, undefined, 421],
  ["rebound host on the page", "/", { Host: "evil.example:4100" }, undefined, 421],
  ["cross-origin post", "/api/push", { Origin: "http://evil.example" }, {}, 403],
  ["post without origin", "/api/pull", { Origin: "" }, {}, 403],
  ["rename without a token", "/api/devices/rename", { Authorization: "" }, { name: "x" }, 401],
  [
    "cross-origin rename",
    "/api/devices/rename",
    { Origin: "http://evil.example" },
    { name: "x" },
    403,
  ],
  [
    "history without a token",
    "/api/history?root=/x&path=.env",
    { Authorization: "" },
    undefined,
    401,
  ],
  ["cross-origin restore", "/api/history/restore", { Origin: "http://evil.example" }, restore, 403],
  ["restore without origin", "/api/history/restore", { Origin: "" }, restore, 403],
  ["unknown path", "/nope", {}, undefined, 404],
] as const)("%s is refused", async (_name, path, headers, body, status) => {
  const { response } = await send(app(fixture.first), path, headers, body);

  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("the page is served with strict headers and no token", async () => {
  const { response, text } = await send(app(fixture.first), "/", { Authorization: "" });

  expect(response.status).toBe(200);
  expect(text).toBe("<p>page</p>");
  expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});

test("HEAD answers like GET with no body, without an Origin", async () => {
  const dashboard = app(fixture.first);
  const headers = { Host: "127.0.0.1:4100", Authorization: "Bearer test-token" };

  for (const path of ["/", "/api/devices", "/nope"]) {
    const url = `http://127.0.0.1:4100${path}`;
    const get = await dashboard.request(url, { headers });
    const head = await dashboard.request(url, { method: "HEAD", headers });

    expect([path, head.status]).toEqual([path, get.status]);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(await head.text()).toBe("");
  }
});

test("status names changed keys, never values", async () => {
  await atomicWrite(fixture.aStore, "TOKEN=local-test-value\nNEW=mine-only-secret\n", fixture.now);
  const { response, json } = await send(app(fixture.first), "/api/status");
  const status = json();

  expect(response.headers.get("Cache-Control")).toBe("no-store");

  expect(status.overview).toMatchObject({
    deviceName: "first",
    pending: 1,
    unlock: { kind: "until", until: fixture.now() + 2592000000 },
    checkedAt: fixture.now(),
  });

  expect(status.repos[0].repoId).toBe("github.com/example/project");

  expect(status.repos[0].checkouts[0].files[0]).toMatchObject({
    path: ".env",
    status: "local-changes",
    keys: { kind: "diff", added: ["NEW"], removed: [], changed: [] },
  });
});

test("the unlock expiry recorded by envden unlock shows once the server agrees", async () => {
  const state = (await loadState(fixture.third.home))!;
  const until = fixture.now() + 86400000;
  state.session = { unlockedUntil: until, freshUntil: fixture.now() };
  await saveState(fixture.third.home, state, fixture.now);

  const status = (await send(app(fixture.third), "/api/status")).json();
  expect(status.overview.unlock).toEqual({ kind: "until", until });
});

test("push and pull call through", async () => {
  const pushed = (await send(app(fixture.first), "/api/push", {}, {})).json();
  expect(pushed).toMatchObject({ kind: "pushed", conflicts: 0 });
  expect(pushed.changed).toBeGreaterThan(0);

  const after = (await send(app(fixture.first), "/api/status")).json();
  expect(after.overview.pending).toBe(0);

  expect(after.repos[0].checkouts[0].files[0]).toEqual({
    path: ".env",
    mode: "link",
    status: "in-sync",
  });

  const pulled = await send(app(fixture.second), "/api/pull", {}, {});
  expect(pulled.json()).toMatchObject({ kind: "pulled", conflicts: 0 });

  const devices = (await send(app(fixture.second), "/api/devices")).json();

  expect(devices.map((device: { name: string }) => device.name).sort()).toEqual([
    "first",
    "second",
    "third",
  ]);

  expect(devices.find((device: { current: boolean }) => device.current).name).toBe("second");
});

test("conflicts list their keys and resolve through the dashboard", async () => {
  const { first, second, opts, aStore, now } = fixture;
  const bStore = (await loadState(second.home))!.links[0]!.store;

  await pull(first, opts);
  await atomicWrite(aStore, "TOKEN=local-test-value\nA=server-only-secret\n", now);
  await atomicWrite(bStore, "TOKEN=local-test-value\nA=mine-only-secret\n", now);
  await send(app(first), "/api/push", {}, {});
  expect((await send(app(second), "/api/pull", {}, {})).json().conflicts).toBe(1);

  const status = (await send(app(second), "/api/status")).json();
  expect(status.conflicts).toHaveLength(1);

  expect(status.repos[0].checkouts[0].files[0]).toMatchObject({
    status: "conflict",
    held: "conflict",
    conflictId: status.conflicts[0].id,
  });

  expect(status.conflicts[0].keys).toEqual({
    kind: "diff",
    added: [],
    removed: [],
    changed: ["A"],
  });

  const invalid = await send(
    app(second),
    "/api/resolve",
    {},
    { id: status.conflicts[0].id, choice: "edit" },
  );

  expect(invalid.response.status).toBe(400);

  const resolved = await send(
    app(second),
    "/api/resolve",
    {},
    { id: status.conflicts[0].id, choice: "take-server" },
  );

  expect(resolved.json()).toMatchObject({ kind: "resolved", path: ".env" });
  expect(await readFile(bStore, "utf8")).toContain("A=server-only-secret");
  expect((await send(app(second), "/api/status")).json().conflicts).toEqual([]);
});

test("no response carried an env value", () => {
  expect(client.bodies.length).toBeGreaterThan(15);

  for (const body of client.bodies)
    for (const secret of secrets) expect(body).not.toContain(secret);
});
