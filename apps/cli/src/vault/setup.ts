import { withStateLock } from "../state/lock/lock.ts";
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
import { saveState, loadState } from "../state/store/repository.ts";
import { createGenesis } from "./genesis.ts";
import { createVaultSwap } from "./creation.ts";
import { VERSION, MIN_SERVER } from "../version.ts";

async function lockedsetupVault(
  adapters: TAdapters,
  options: {
    address: string;
    token: string;
    name: string;
    password: string;
    now: () => number;
    fetcher: TFetch;
    resumeSecretKey?: string;
    onKit?: (kit: {
      secretKey: string;
      vaultId: string;
      server: string;
      masterPassword: string;
    }) => Promise<void>;
  },
) {
  const existing = await loadState(adapters.home);

  if (existing?.vaultId && !existing.creationPending) {
    return { state: existing, kit: resumedKit(existing.vaultId, options) };
  }

  const token = p.decodeToken("setup", options.token);
  await hello(options.address, token.serverPin, options.fetcher, MIN_SERVER);
  const identity = await deviceIdentity(adapters.keychain, adapters.home, options.name);

  if (existing?.creationPending && existing.vaultId && existing.server) {
    const kit = resumedKit(existing.vaultId, options);

    const client = createClient({
      address: existing.server.address,
      pin: token.serverPin,
      vaultId: p.unbase32(existing.vaultId),
      identity,
      version: VERSION,
      now: options.now,
      fetcher: options.fetcher,
      proof: (request) => p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
    });

    await client.request(
      "/v1/vault",
      "POST",
      new Uint8Array(Buffer.from(existing.creationPending, "base64url")),
    );

    delete existing.creationPending;
    await saveState(adapters.home, existing);

    return { state: existing, kit };
  }

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

  const client = createClient({
    address: options.address,
    pin: token.serverPin,
    vaultId: material.vaultId,
    identity,
    version: VERSION,
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
    state.creationPending = text(bytes);
    const kit = { ...creation.kit, server: options.address, masterPassword: "________________" };

    await options.onKit?.(kit);

    state.headers = [text(p.encode(p.signedCodec(p.ManifestHeaderCodec), creation.swap.header))];
    state.files = text(p.encode(p.FilesCodec, creation.swap.files!));
    state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, creation.swap.header, "manifest"));
    await saveState(adapters.home, state);
    await client.request("/v1/vault", "POST", bytes);
    delete state.creationPending;
    await saveState(adapters.home, state);

    return {
      state,
      kit,
    };
  } finally {
    material.recoveryKeys.encSk.fill(0);
    material.recoveryKeys.objSk.fill(0);
  }
}

export function setupVault(...args: Parameters<typeof lockedsetupVault>) {
  return withStateLock(args[0].home, () => lockedsetupVault(...args));
}

function resumedKit(vaultId: string, options: { address: string; resumeSecretKey?: string }) {
  if (!options.resumeSecretKey)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Resume setup with the recovery kit issued before creation",
    );

  p.decodeSecretKey(options.resumeSecretKey);

  return {
    vaultId,
    secretKey: options.resumeSecretKey,
    server: options.address,
    masterPassword: "________________",
  };
}
