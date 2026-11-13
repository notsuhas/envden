import type { Hono } from "hono";
import {
  H,
  equal,
  DevicesResponseSchema,
  ObjectsResponseSchema,
  TransferResponseSchema,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth, TServerEnv } from "../../http/types.ts";
import { binary, text, input } from "../../http/encoding.ts";
import { vaultChain } from "../../vault/chain.ts";
import { requireRead } from "../../vault/access.ts";
import { requireGate } from "../../middleware/gates.ts";
import { requireRepair } from "../../vault/authorization.ts";

function found(value: Uint8Array | undefined) {
  if (!value) throw new EnvdenError("NOT_FOUND", "Object unavailable");

  return new Response(value, { headers: { "Content-Type": "application/octet-stream" } });
}

function readRange(
  options: IAppOptions,
  auth: IAuth,
  kind: "headers" | "entries",
  start: string | undefined,
  end: string | undefined,
) {
  requireRead(options, auth, "history");
  const from = input(() => BigInt(start ?? "0"));
  const to = input(() => BigInt(end ?? "18446744073709551615"));

  if (from < 0n || to < from || to > 0xffffffffffffffffn)
    throw new EnvdenError("INVALID_INPUT", "Invalid range");

  return {
    objects: options.storage[kind](auth.request.vaultId, from, to).map((o) => text(o.bytes)),
  };
}

function readObject(
  options: IAppOptions,
  auth: IAuth,
  kind: "files" | "keyring" | "blob",
  encoded: string,
) {
  const hash = binary(encoded, 32);
  requireRead(options, auth, kind, hash);
  const v = auth.request.vaultId;
  const storage = options.storage;

  return found(
    kind === "files"
      ? storage.fileList(v, hash)
      : kind === "keyring"
        ? storage.state(v, "keyring", hash)
        : storage.getBlob(v, hash),
  );
}

export function registerReads(app: Hono<TServerEnv>, options: IAppOptions) {
  const { storage } = options;

  return app
    .get("/v1/devices", (c) => {
      const auth = c.get("auth");
      requireGate(options, auth, "unlocked");
      const vault = auth.request.vaultId;

      return c.json(
        DevicesResponseSchema.parse({
          devices: [...vaultChain(storage, vault).state.devices.values()].map((device) => {
            const seen = storage.device(vault, device.id)?.clientVersion;

            return { id: text(device.id), clientVersion: seen || null, confirmed: !!seen };
          }),
        }),
      );
    })
    .get("/v1/headers", (c) =>
      c.json(readRange(options, c.get("auth"), "headers", c.req.query("from"), c.req.query("to"))),
    )
    .get("/v1/entries", (c) =>
      c.json(readRange(options, c.get("auth"), "entries", c.req.query("from"), c.req.query("to"))),
    )
    .get("/v1/head", (c) => {
      const auth = c.get("auth");
      requireRead(options, auth, "history");
      const hash = storage.head(auth.request.vaultId);

      return found(hash && storage.header(auth.request.vaultId, hash)?.bytes);
    })
    .get("/v1/files/:hash", (c) => readObject(options, c.get("auth"), "files", c.req.param("hash")))
    .get("/v1/keyrings/:hash", (c) =>
      readObject(options, c.get("auth"), "keyring", c.req.param("hash")),
    )
    .get("/v1/blobs/:hash", (c) => readObject(options, c.get("auth"), "blob", c.req.param("hash")))
    .get("/v1/blobs", (c) => {
      const auth = c.get("auth");
      requireRead(options, auth, "blob");

      return c.json(
        ObjectsResponseSchema.parse({
          objects: storage.blobHashes(auth.request.vaultId).map(text),
        }),
      );
    })
    .get("/v1/envelope", (c) => {
      const auth = c.get("auth");
      requireRead(options, auth, "envelope");

      return found(storage.state(auth.request.vaultId, "envelope", new Uint8Array()));
    })
    .put("/v1/blobs/:hash", async (c) => {
      const auth = c.get("auth");
      const vault = storage.vault(auth.request.vaultId)!;

      if (vault.restored) requireRepair(options, auth);
      else if (!vault.active) {
        const owner = storage.state(auth.request.vaultId, "move-session", new Uint8Array());

        if (!owner || !equal(owner, auth.request.device))
          throw new EnvdenError("MOVING", "Vault moving");
      } else requireGate(options, auth, "unlocked");

      const hash = binary(c.req.param("hash"), 32);
      const bytes = new Uint8Array(await c.req.arrayBuffer());

      if (bytes.length > 16777216 || !bytes.length || !equal(H("blob", bytes), hash))
        throw new EnvdenError("INVALID_INPUT", "Invalid blob");

      storage.putBlob(auth.request.vaultId, hash, bytes, (b) => H("blob", b));

      return c.json(TransferResponseSchema.parse({ kind: "uploaded" }));
    });
}
