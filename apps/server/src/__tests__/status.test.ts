import { beforeAll, expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { createApp } from "../app.ts";
import { text } from "../http/encoding.ts";
import type { IServerKeys } from "../http/types.ts";
import { createStatusState } from "../status/state.ts";
import { pruneHistorySafely } from "../vault/prune.ts";
import { candidate, fixture, identity, vaultId } from "./fixture.ts";

let keys: IServerKeys;

beforeAll(() => {
  keys = identity();
});

function seedCanary(f: ReturnType<typeof fixture>) {
  const device = candidate("canary-laptop-5521");
  const recovery = p.generateRecoveryKeys();
  const zero = new Uint8Array(32);

  const genesis = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: zero,
      seq: 0n,
      parent: zero,
      kind: 0,
      payload: {
        serverPin: p.serverPin(keys.publicKey),
        device: device.record,
        recovery: { id: p.recoveryId(recovery), encPub: recovery.encPub, objPub: recovery.objPub },
        vaultNonce: p.randomBytes(32),
        createdAt: 1n,
      },
      signer: device.record.id,
    },
    device.keys.objSk,
    "entry",
  );

  const id = p.objectHash(p.EntryCodec, genesis, "entry");
  const fileId = p.randomBytes(16);
  const blob = p.randomBytes(4096);
  const blobHash = p.H("blob", blob);
  const list = p.concat(fileId, blobHash);

  f.storage.configureVault(id, {
    active: true,
    frozen: false,
    proofRefused: false,
  });

  f.storage.putBlob(id, blobHash, blob, undefined, f.options.now());

  const committed = f.storage.commitSwap(
    id,
    undefined,
    {
      header: { hash: p.randomBytes(32), seq: 1n, bytes: p.randomBytes(64) },
      entries: [{ hash: id, seq: 0n, bytes: p.signedCodec(p.EntryCodec).write(genesis) }],
      bodyDigest: p.randomBytes(32),
      files: {
        hash: p.H("files", list),
        bytes: list,
        versions: [{ fileId, version: 1n, blobHash, tombstone: false }],
      },
    },
    f.options.now(),
  );

  expect(committed.kind).toBe("committed");

  f.storage.putDevice(id, device.record.id, { clientVersion: "1.0.0" });

  return { id, secrets: [device.record.name, fileId, blobHash, device.record.id] };
}

function encodings(value: string | Uint8Array) {
  if (typeof value === "string") return [value];

  return [
    Buffer.from(value).toString("hex"),
    Buffer.from(value).toString("base64"),
    text(value),
    p.base32(value),
  ];
}

async function both(app: ReturnType<typeof createApp>) {
  const page = await app.request("/");
  const json = await app.request("/v1/status");

  return { page, json, html: await page.text(), body: await json.text() };
}

test("page and JSON load unsigned with strict headers", async () => {
  const f = fixture(keys);

  try {
    const { page, json, html, body } = await both(f.app);

    expect([page.status, json.status]).toEqual([200, 200]);
    expect(page.headers.get("Content-Type")).toStartWith("text/html");
    expect(html).toContain("envden ui");
    expect(html).not.toContain("<script");

    const inline = html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
    const hash = Buffer.from(p.sha256(new TextEncoder().encode(inline))).toString("base64");

    expect(page.headers.get("Content-Security-Policy")).toContain(`style-src 'sha256-${hash}'`);

    for (const response of [page, json]) {
      const csp = response.headers.get("Content-Security-Policy")!;

      expect(csp).toStartWith("default-src 'none'; style-src 'sha256-");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }

    expect(p.StatusResponseSchema.parse(JSON.parse(body))).toMatchObject({
      version: "1.0.0",
      mode: "normal",
      vaults: 1,
      fullestVault: "below-50",
      lastPrune: null,
    });
  } finally {
    f.close();
  }
});

test("no vault, device or file data leaks", async () => {
  const f = fixture(keys);

  try {
    const canary = seedCanary(f);
    const { html, body } = await both(f.app);
    const status = JSON.parse(body);

    expect(status.vaults).toBe(2);
    expect(status.storageBytes).toBeGreaterThan(4096);

    for (const secret of [vaultId, canary.id, ...canary.secrets])
      for (const encoded of encodings(secret)) {
        expect(html).not.toContain(encoded);
        expect(body).not.toContain(encoded);
      }
  } finally {
    f.close();
  }
});

test("restored mode and the last prune show", async () => {
  const f = fixture(keys);
  const state = createStatusState(f.options.now(), {});
  const app = createApp(f.options, undefined, state);

  try {
    state.lastPrune = { at: f.options.now(), ok: pruneHistorySafely(f.options) };
    f.advance(90000);

    f.storage.configureVault(vaultId, {
      ...f.storage.vault(vaultId)!,
      restored: { repairTokenHash: p.randomBytes(32), restoredHead: f.storage.head(vaultId)! },
    });

    const { html, body } = await both(app);

    expect(p.StatusResponseSchema.parse(JSON.parse(body))).toMatchObject({
      mode: "restored",
      uptimeSeconds: 90,
      lastPrune: { at: new Date(1000000).toISOString(), ok: true },
    });

    expect(html).toMatch(/restored/i);
    expect(html).toContain("succeeded");
  } finally {
    f.close();
  }
});

test("ENVDEN_STATUS_PAGE=off returns 404 on both routes", async () => {
  const f = fixture(keys);
  const app = createApp(f.options, undefined, createStatusState(0, { ENVDEN_STATUS_PAGE: "off" }));

  try {
    const { page, json } = await both(app);

    expect([page.status, json.status]).toEqual([404, 404]);
  } finally {
    f.close();
  }
});

test("rate limited; bodies and other routes are still refused", async () => {
  const f = fixture(keys);

  try {
    for (let i = 0; i < 60; i++) await f.app.request("/v1/status");

    expect((await f.app.request("/")).status).toBe(429);
    f.advance(60000);
    expect((await f.app.request("/v1/status", { method: "POST", body: "x" })).status).toBe(404);

    expect(
      (await f.app.request("/", { method: "GET", headers: { "Content-Length": "1" } })).status,
    ).toBe(400);

    expect((await f.app.request("/v1/status/x")).status).toBe(404);
    expect((await f.app.request("/v1/head")).status).toBe(400);

    const forged = f.request("/v1/head", undefined, {
      headers: { "Envden-Signature": text(p.randomBytes(64)) },
    });

    expect((await forged.send()).status).toBe(401);
  } finally {
    f.close();
  }
});

test("HEAD on a GET route answers like GET with no body", async () => {
  const f = fixture(keys);

  try {
    const hello = `/v1/hello?challenge=${text(p.randomBytes(32))}`;

    for (const path of ["/", "/v1/status", hello, "/v1/head", "/v1/devices", "/nope"]) {
      const get = await f.app.request(path);
      const head = await f.app.request(path, { method: "HEAD" });

      expect([path, head.status]).toEqual([path, get.status]);
      expect([...head.headers]).toEqual([...get.headers]);
      expect(await head.text()).toBe("");
    }
  } finally {
    f.close();
  }
});
