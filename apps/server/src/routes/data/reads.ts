import type { Hono } from "hono";
import { ObjectsResponseSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth, TServerEnv } from "../../http/types.ts";
import { binary, text } from "../../http/encoding.ts";
import { readDevices } from "../../vault/reads/devices.ts";
import { uploadBlob } from "../../vault/blobs/upload.ts";
import { requireRead } from "../../vault/access.ts";
import { readRange } from "../../vault/reads/history.ts";

function found(value: Uint8Array | undefined) {
  if (!value) throw new EnvdenError("NOT_FOUND", "Object unavailable");

  return new Response(value, { headers: { "Content-Type": "application/octet-stream" } });
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
      return c.json(readDevices(options, c.get("auth")));
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
      return c.json(
        uploadBlob(
          options,
          c.get("auth"),
          binary(c.req.param("hash"), 32),
          new Uint8Array(await c.req.arrayBuffer()),
        ),
      );
    });
}
