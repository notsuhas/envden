import type { Context } from "hono";
import type { IAppOptions, TServerEnv } from "../../http/types.ts";
import { requireRead } from "../../vault/access.ts";
import { binary } from "../../http/encoding.ts";
import { accessJoinRequest } from "../../join/requests.ts";

export function authorizeNonMember(c: Context<TServerEnv>, options: IAppOptions) {
  const auth = c.get("auth");
  if (auth.member || c.req.method !== "GET") return;
  const path = c.req.path;

  if (["/v1/head", "/v1/headers", "/v1/entries", "/v1/envelope"].includes(path))
    requireRead(options, auth, path === "/v1/envelope" ? "envelope" : "history");

  const match = /^\/v1\/(files|keyrings|blobs)\/([^/]+)$/.exec(path);

  if (match)
    requireRead(
      options,
      auth,
      match[1] === "files" ? "files" : match[1] === "keyrings" ? "keyring" : "blob",
      binary(match[2], 32),
    );

  const slot = /^\/v1\/join-requests\/([1-9][0-9]{0,2})\/(offer|reveal)$/.exec(path);

  if (slot)
    accessJoinRequest(options, auth, Number(slot[1]), {
      kind: "read",
      slot: slot[2] === "offer" ? "offer" : "reveal",
    });
}
