import {
  resumedKit,
  lostKitReplacement,
  BLANK_PASSWORD,
  type ISetupKit,
} from "./recovery/pending-kit.ts";
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
    readResumeSecretKey?: () => Promise<string | undefined>;
    onKit?: (kit: ISetupKit) => Promise<void>;
  },
) {
  const existing = await loadState(adapters.home);

  if (existing?.vaultId && !existing.creationPending) {
    return { state: existing, kit: resumedKit(existing, options) };
  }

  const token = p.decodeToken("setup", options.token);
  await hello(options.address, token.serverPin, options.fetcher, MIN_SERVER);
  const identity = await deviceIdentity(adapters.keychain, adapters.home, options.name);

  const pending = await resumableCreation(adapters, existing, identity.record.id);

  if (pending) {
    const resumed = await resumeCreation(adapters, options, token, identity, pending);
    if (resumed) return resumed;
  }

  const material = await createGenesis(identity, token.serverPin, options.now());
  const state = emptyState(options.name);
  state.vaultId = p.base32(material.vaultId);
  state.server = { address: options.address, pin: text(token.serverPin), protocol: 1 };

  state.entries = [material.genesis, material.epoch].map((entry) =>
    text(p.encode(p.signedCodec(p.EntryCodec), entry)),
  );

  state.keyring = text(material.keyring);

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
    const kit = { ...creation.kit, server: options.address, masterPassword: BLANK_PASSWORD };

    await options.onKit?.(kit);

    state.headers = [text(p.encode(p.signedCodec(p.ManifestHeaderCodec), creation.swap.header))];
    state.files = text(p.encode(p.FilesCodec, creation.swap.files!));
    state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, creation.swap.header, "manifest"));
    await adapters.keychain.set(`envden/${adapters.home}/epoch/1`, material.epochKey);
    await adapters.keychain.set(`envden/${adapters.home}/id-key`, material.idKey);
    await saveState(adapters.home, state, adapters.now);
    await client.request("/v1/vault", "POST", bytes);
    delete state.creationPending;
    await saveState(adapters.home, state, adapters.now);

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

async function resumableCreation(
  adapters: TAdapters,
  state: Awaited<ReturnType<typeof loadState>>,
  deviceId: Uint8Array,
) {
  if (!state?.creationPending || !state.vaultId || !state.server) return undefined;
  const epoch = await adapters.keychain.get(`envden/${adapters.home}/epoch/1`);
  const id = await adapters.keychain.get(`envden/${adapters.home}/id-key`);

  const valid =
    epoch && id && matchesPendingKey(state.creationPending, state.vaultId, epoch, deviceId);

  return valid
    ? {
        state,
        creationPending: state.creationPending,
        vaultId: state.vaultId,
        server: state.server,
      }
    : undefined;
}

async function resumeCreation(
  adapters: TAdapters,
  options: Parameters<typeof lockedsetupVault>[1],
  token: ReturnType<typeof p.decodeToken>,
  identity: Awaited<ReturnType<typeof deviceIdentity>>,
  pending: NonNullable<Awaited<ReturnType<typeof resumableCreation>>>,
) {
  const resumeSecretKey = options.resumeSecretKey ?? (await options.readResumeSecretKey?.());

  const kit = resumeSecretKey
    ? resumedKit(pending.state, { ...options, resumeSecretKey })
    : undefined;

  const client = createClient({
    address: pending.server.address,
    pin: token.serverPin,
    vaultId: p.unbase32(pending.vaultId),
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
    proof: (request) => p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
  });

  try {
    await client.request(
      "/v1/vault",
      "POST",
      new Uint8Array(Buffer.from(pending.creationPending, "base64url")),
    );
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "UNAUTHORIZED") throw error;

    return undefined;
  }

  delete pending.state.creationPending;
  await saveState(adapters.home, pending.state, adapters.now);
  if (kit) return { state: pending.state, kit };

  return lostKitReplacement(adapters, options);
}

function matchesPendingKey(
  encoded: string,
  vaultId: string,
  epoch: Uint8Array,
  deviceId: Uint8Array,
) {
  const swap = p.decode(p.SwapCodec, new Uint8Array(Buffer.from(encoded, "base64url")));
  const change = swap.entries.find((entry) => entry.body.kind === 3)?.body;

  return (
    p.equal(swap.header.body.signer, deviceId) &&
    change?.kind === 3 &&
    p.equal(p.keyCommit(epoch, p.unbase32(vaultId), 1), change.payload.change.keyCommit)
  );
}
