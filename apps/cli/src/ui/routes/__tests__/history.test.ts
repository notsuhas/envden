import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { loadState, saveState } from "../../../state/store/repository.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { readBytes } from "../../../sync/local/files.ts";
import { pull, push } from "../../../sync/engine.ts";
import { removeFile } from "../../../sync/remove.ts";
import { createSharedFixture } from "../../../sync/__tests__/shared-fixture.ts";
import { dashboardClient } from "../../server/__tests__/client.ts";

const syncFixture = createSharedFixture();
const secrets = ["local-test-value", "secret-db-v2", "rotated-secret-v3", "detached-secret"];
const v1 = "TOKEN=local-test-value\n";
const v2 = "TOKEN=local-test-value\nDB_URL=postgres://secret-db-v2\n";
const v3 = "TOKEN=rotated-secret-v3\nDB_URL=postgres://secret-db-v2\n";

async function threeVersions() {
  const f = await syncFixture();
  const at = (offset: number) => ({ ...f.opts, now: () => f.now() + offset });
  const client = dashboardClient(f.now);

  await atomicWrite(f.aStore, v2, f.now);
  await push(f.first, at(60000));
  await pull(f.second, f.opts);
  const bStore = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(bStore, v3, f.now);
  await push(f.second, at(120000));
  await pull(f.first, f.opts);

  const file = { root: f.checkout.root, path: ".env" };
  const query = `/api/history?${new URLSearchParams(file).toString()}`;

  const restore = (version: unknown, adapters = f.first, root = f.checkout.root) =>
    client.send(client.app(adapters), "/api/history/restore", {}, { root, path: ".env", version });

  const text = async (path: string) => new TextDecoder().decode(await readBytes(path));

  return { f, client, bStore, file, query, restore, text };
}

function expectNoValues(bodies: string[]) {
  expect(bodies.length).toBeGreaterThan(0);

  for (const body of bodies) for (const secret of secrets) expect(body).not.toContain(secret);
}

test("history lists versions with devices and key names, never values", async () => {
  const { f, client, query } = await threeVersions();
  const { response, json } = await client.send(client.app(f.first), query);
  const history = json();

  expect(response.status).toBe(200);

  expect(history).toMatchObject({
    repoId: "github.com/example/project",
    path: ".env",
    pruned: false,
    checkouts: [{ root: f.checkout.root, version: 3 }],
  });

  expect(history.versions).toEqual([
    {
      version: 3,
      kind: "live",
      time: new Date(f.now() + 120000).toISOString(),
      device: "second",
      changes: { added: [], changed: ["TOKEN"], removed: [] },
    },
    {
      version: 2,
      kind: "live",
      time: new Date(f.now() + 60000).toISOString(),
      device: "first",
      changes: { added: ["DB_URL"], changed: [], removed: [] },
    },
    {
      version: 1,
      kind: "live",
      time: new Date(f.now()).toISOString(),
      device: "first",
      changes: { added: ["TOKEN"], changed: [], removed: [] },
    },
  ]);

  expectNoValues(client.bodies);
});

test.each([
  ["no path", { root: "/tmp/x" }],
  ["a relative root", { root: "checkout", path: ".env" }],
  ["an extra field", { root: "/tmp/x", path: ".env", version: "1" }],
])("history rejects %s", async (_name, input) => {
  const f = await syncFixture();
  const { app, send } = dashboardClient(f.now);
  const query = new URLSearchParams(input as Record<string, string>).toString();
  const { response, json } = await send(app(f.first), `/api/history?${query}`);

  expect(response.status).toBe(400);
  expect(json()).toEqual({ error: "INVALID_INPUT", message: "Choose an env file" });
});

test.each([
  ["no version", undefined],
  ["version zero", 0],
  ["a fractional version", 1.5],
  ["a version string", "v1"],
])("restore rejects %s", async (_name, version) => {
  const { restore } = await threeVersions();
  const { response, json } = await restore(version);

  expect(response.status).toBe(400);
  expect(json()).toEqual({ error: "INVALID_INPUT", message: "Choose a version" });
});

test("restore rewrites only the local file and waits for Push", async () => {
  const { f, client, bStore, query, restore, text } = await threeVersions();
  const restored = await restore(1);

  expect(restored.json()).toMatchObject({
    kind: "restored",
    path: join(f.checkout.root, ".env"),
    version: 1,
    changes: { added: [], changed: ["TOKEN"], removed: ["DB_URL"] },
  });

  expect(await text(f.aStore)).toBe(v1);

  const status = (await client.send(client.app(f.first), "/api/status")).json();
  expect(status.repos[0].checkouts[0].files[0].status).toBe("local-changes");

  const history = (await client.send(client.app(f.first), query)).json();

  expect(history.versions.map((version: { version: number }) => version.version)).toEqual([
    3, 2, 1,
  ]);

  expect(history.checkouts[0].version).toBe(1);

  expect((await pull(f.second, f.opts)).changed).toBe(0);
  expect(await text(bStore)).toBe(v3);
  expect((await restore(1)).json()).toMatchObject({ kind: "unchanged", version: 1 });

  expectNoValues(client.bodies);
});

test("restore refusals come back as errors and leave the file alone", async () => {
  const { f, client, bStore, restore, text } = await threeVersions();

  const missing = await restore(9);
  expect(missing.response.status).toBe(404);

  await atomicWrite(bStore, "TOKEN=rotated-secret-v3\nNEW=local-test-value\n", f.now);
  await removeFile(f.first, join(f.checkout.root, ".env"), { yes: true, now: f.now });
  await push(f.first, { ...f.opts, now: () => f.now() + 180000 });

  const deletion = await restore(4, f.second, f.checkoutB.root);
  expect(deletion.response.status).toBe(400);
  expect(deletion.json().message).toBe("That version deleted the file; choose one with content");

  const destination = join(f.checkoutB.root, ".env");
  await rm(destination);
  await writeFile(destination, "TOKEN=detached-secret\n");

  const detached = await restore(1, f.second, f.checkoutB.root);
  expect(detached.response.status).toBe(409);
  expect(await text(destination)).toBe("TOKEN=detached-secret\n");

  const state = (await loadState(f.second.home))!;
  state.links[0]!.localOnly = true;
  await saveState(f.second.home, state, f.now);

  const localOnly = await restore(1, f.second, f.checkoutB.root);
  expect(localOnly.response.status).toBe(400);
  expect(await text(bStore)).toBe("TOKEN=rotated-secret-v3\nNEW=local-test-value\n");

  expectNoValues(client.bodies);
});
