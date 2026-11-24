import { withStateLock } from "../state/lock/lock.ts";
import type { TFetch } from "../client/fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { deviceIdentity } from "../identity/device.ts";
import { hello } from "../client/hello.ts";
import { createClient } from "../client/request.ts";
import { text } from "../client/encoding.ts";
import { emptyState } from "../state/model.ts";
import { saveState, loadState } from "../state/store/repository.ts";
import { replaceCode } from "../admin/recovery/replace.ts";
import { createGenesis } from "./genesis.ts";
import { createVaultSwap } from "./creation.ts";
import { VERSION, MIN_SERVER } from "../version.ts";

interface ISetupVault {
  address: string;
  token: string;
  name: string;
  now: () => number;
  fetcher: TFetch;
  onCode: (code: string) => Promise<void>;
}

const LOST_CODE = "Vault created without a recovery code; run envden vault recovery-code";

async function lockedsetupVault(adapters: TAdapters, options: ISetupVault) {
  const existing = await loadState(adapters.home);
  if (existing?.vaultId && !existing.creationPending) return { state: existing };

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

  state.server = {
    address: options.address,
    pin: text(token.serverPin),
    protocol: p.PROTOCOL_VERSION,
  };

  state.entries = [material.genesis, material.epoch].map((entry) =>
    text(p.encode(p.signedCodec(p.EntryCodec), entry)),
  );

  state.keyring = text(material.keyring);
  const client = setupClient(options, token, material.vaultId, identity);
  const code = p.generateRecoveryCode();

  try {
    const swap = createVaultSwap(material, identity, code, options.now());
    const bytes = p.encode(p.SwapCodec, swap);
    state.creationPending = text(bytes);
    state.headers = [text(p.encode(p.signedCodec(p.ManifestHeaderCodec), swap.header))];
    state.files = text(p.encode(p.FilesCodec, swap.files!));
    state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"));
    await adapters.keychain.set(`envden/${adapters.home}/epoch/1`, material.epochKey);
    await adapters.keychain.set(`envden/${adapters.home}/id-key`, material.idKey);
    await saveState(adapters.home, state, adapters.now);
    await client.request("/v1/vault", "POST", bytes);
    // Still pending until the code is delivered, so a rerun replaces a code nobody saw.
    await options.onCode(p.encodeRecoveryCode(code));
    delete state.creationPending;
    await saveState(adapters.home, state, adapters.now);

    return { state };
  } finally {
    material.recoveryKeys.encSk.fill(0);
    material.recoveryKeys.objSk.fill(0);
    code.fill(0);
  }
}

export function setupVault(...args: Parameters<typeof lockedsetupVault>) {
  return withStateLock(args[0].home, () => lockedsetupVault(...args));
}

function setupClient(
  options: ISetupVault,
  token: ReturnType<typeof p.decodeToken>,
  vaultId: Uint8Array,
  identity: Awaited<ReturnType<typeof deviceIdentity>>,
) {
  return createClient({
    address: options.address,
    pin: token.serverPin,
    vaultId,
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
    proof: (request) => p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
  });
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
    ? { state, creationPending: state.creationPending, vaultId: state.vaultId }
    : undefined;
}

// The device never kept the first code, so a resumed creation replaces it as soon as it commits.
async function resumeCreation(
  adapters: TAdapters,
  options: ISetupVault,
  token: ReturnType<typeof p.decodeToken>,
  identity: Awaited<ReturnType<typeof deviceIdentity>>,
  pending: NonNullable<Awaited<ReturnType<typeof resumableCreation>>>,
) {
  const client = setupClient(options, token, p.unbase32(pending.vaultId), identity);

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

  return finishCreation(adapters, options);
}

// Creation stays pending until a replacement code is delivered, so every rerun can still deliver one.
async function finishCreation(
  adapters: TAdapters,
  options: Omit<ISetupVault, "address" | "token" | "name">,
) {
  await replaceCode(adapters, options.now, options.onCode, options.fetcher).catch(
    (cause: unknown) => {
      throw new EnvdenError("RECOVERY_CODE_REQUIRED", LOST_CODE, { cause });
    },
  );

  const state = (await loadState(adapters.home))!;
  delete state.creationPending;
  await saveState(adapters.home, state, adapters.now);

  return { state };
}

// A creation that already committed needs no setup token, which it consumed; only a code to deliver.
export function resumeCommittedSetup(
  adapters: TAdapters,
  options: Omit<ISetupVault, "address" | "token" | "name">,
) {
  return withStateLock(adapters.home, async () => {
    const state = await loadState(adapters.home);
    if (!state?.creationPending || !state.vaultId || !state.server) return undefined;
    const identity = await deviceIdentity(adapters.keychain, adapters.home, state.deviceName);

    const client = createClient({
      address: state.server.address,
      pin: Buffer.from(state.server.pin, "base64url"),
      vaultId: p.unbase32(state.vaultId),
      identity,
      version: VERSION,
      now: options.now,
      fetcher: options.fetcher,
    });

    try {
      await client.request("/v1/head");
    } catch (error) {
      if (error instanceof EnvdenError) return undefined;
      throw error;
    }

    return finishCreation(adapters, options);
  });
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
