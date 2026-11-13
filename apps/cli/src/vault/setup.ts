import type { TFetch } from "../client/fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { deviceIdentity } from "../identity/device.ts";
import { hello } from "../client/hello.ts";
import { createClient } from "../client/request.ts";
import { text } from "../client/encoding.ts";
import { registerPassword } from "../session/registration.ts";
import { emptyState } from "../state/model.ts";
import { saveState, loadState } from "../state/repository.ts";
import { atomicWrite } from "../state/files.ts";
import { join } from "node:path";
import { createGenesis } from "./genesis.ts";
import { createVaultSwap } from "./creation.ts";

export async function setupVault(
  adapters: TAdapters,
  options: {
    address: string;
    token: string;
    name: string;
    password: string;
    now: () => number;
    fetcher: TFetch;
  },
) {
  if ((await loadState(adapters.home))?.vaultId)
    throw new EnvdenError("CONFLICT", "This device already has a vault");

  const token = p.decodeToken("setup", options.token);
  await hello(options.address, token.serverPin, options.fetcher, "0.0.0");
  const identity = await deviceIdentity(adapters.keychain, adapters.home, options.name);
  const material = await createGenesis(identity, token.serverPin, options.now());
  const state = emptyState(options.name);
  state.vaultId = p.base32(material.vaultId);
  state.server = { address: options.address, pin: text(token.serverPin), protocol: 1 };

  state.entries = [material.genesis, material.epoch].map((entry) =>
    text(p.encode(p.signedCodec(p.EntryCodec), entry)),
  );

  state.keyring = text(material.keyring);
  await adapters.keychain.set(`envden/${adapters.home}/epoch/1`, material.epochKey);
  await adapters.keychain.set(`envden/${adapters.home}/id-key`, material.idKey);
  await saveState(adapters.home, state);

  const client = createClient({
    address: options.address,
    pin: token.serverPin,
    vaultId: material.vaultId,
    identity,
    version: "0.0.0",
    now: options.now,
    fetcher: options.fetcher,
    proof: (request) => p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
  });

  try {
    const record = await registerPassword(client, material.vaultId, options.password);

    const creation = await createVaultSwap(
      material,
      identity,
      options.password,
      record,
      options.now(),
    );

    const bytes = p.encode(p.SwapCodec, creation.swap);
    await atomicWrite(join(adapters.home, "state", "creation.bin"), bytes);
    state.headers = [text(p.encode(p.signedCodec(p.ManifestHeaderCodec), creation.swap.header))];
    state.files = text(p.encode(p.FilesCodec, creation.swap.files!));
    state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, creation.swap.header, "manifest"));
    await saveState(adapters.home, state);
    await client.request("/v1/vault", "POST", bytes);

    return {
      state,
      kit: { ...creation.kit, server: options.address, masterPassword: "________________" },
    };
  } finally {
    material.recoveryKeys.encSk.fill(0);
    material.recoveryKeys.objSk.fill(0);
  }
}
