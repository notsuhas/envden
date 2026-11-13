import { verifyChain } from "@envden/core/chain";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { THistory } from "../history.ts";
import type { TClient } from "../../client/request.ts";
import { binary, text } from "../../client/encoding.ts";

function joinedHeader(history: THistory, id: Uint8Array, pin: Uint8Array, hash: Uint8Array) {
  const header = history.headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), hash),
  );

  if (!header || !p.equal(history.state.serverPin, pin) || !history.state.devices.has(p.base32(id)))
    throw new EnvdenError("INVALID_DATA", "Pairing membership verification failed");

  return header;
}

export function joinMembership(
  history: THistory,
  id: Uint8Array,
  pin: Uint8Array,
  hash: Uint8Array,
) {
  const header = joinedHeader(history, id, pin, hash);
  const at = verifyChain(history.entries.filter((item) => item.body.seq <= header.body.listSeq));

  if (
    at.kind !== "valid" ||
    !p.equal(at.state.serverPin, pin) ||
    !at.state.devices.has(p.base32(id))
  )
    throw new EnvdenError("INVALID_DATA", "Device was not added at the approved checkpoint");

  return { header, at };
}

export function requireLocalFloor(history: THistory, checkpoint: string | undefined) {
  if (
    checkpoint &&
    !history.headers.some((item) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(checkpoint)),
    )
  )
    throw new EnvdenError("FORK", "Joined history does not descend from the local checkpoint");
}

export async function verifiedBlob(
  client: TClient,
  resource: "keyrings" | "files",
  label: "keyring-blob" | "files",
  hash: Uint8Array,
) {
  const bytes = new Uint8Array(
    await (await client.request(`/v1/${resource}/${text(hash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H(label, bytes), hash))
    throw new EnvdenError("INVALID_DATA", "Invalid join blob hash");

  return bytes;
}
