# Vault sweep

## apps/cli/src/admin/move/switch.ts :: lockedswitchServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedswitchServer(
  adapters: TAdapters,
  address: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const server = await hello(address, undefined, fetcher, MIN_SERVER);

  const client = createClient({
    address,
    pin: server.pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now,
    fetcher,
    version: VERSION,
  });

  const history = await readHistory(client, context.vaultId);
  checkFloor(context.local, history);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);

  if (
    !moved ||
    moved.body.kind !== 5 ||
    !p.equal(moved.body.payload.newPin, server.pin) ||
    !p.equal(history.state.serverPin, server.pin)
  )
    throw new EnvdenError("INVALID_DATA", "Server has no verified move to this pin");

  context.local.server = { address, pin: text(server.pin), protocol: 1 };
  await saveState(adapters.home, context.local, adapters.now);
}
```

## apps/cli/src/admin/move/switch.ts :: switchServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function switchServer(...args: Parameters<typeof lockedswitchServer>) {
  return withStateLock(args[0].home, () => lockedswitchServer(...args));
}
```

## apps/cli/src/admin/move/abort.ts :: lockedabortMove

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedabortMove(
  context: TAdminContext,
  adapters: TAdapters,
  directory: string,
  address: string | undefined,
  options: { now: () => number; fetcher: TFetch },
) {
  const history = await currentHistory(context);

  if (!p.equal(history.state.serverPin, binary(context.local.server!.pin)))
    throw new EnvdenError("MOVING", "Move already committed; resume it instead");

  if (address) {
    const savedPin = await optionalRead(join(directory, "move-pin"));
    if (!savedPin) throw new EnvdenError("INVALID_DATA", "Missing move pin");

    const destination = createClient({
      address,
      pin: binary(savedPin),
      vaultId: context.vaultId,
      identity: context.identity,
      now: options.now,
      fetcher: options.fetcher,
      version: VERSION,
    });

    try {
      await destination.request("/v1/move/discard", "POST");
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "NOT_FOUND") throw error;
    }
  }

  await context.client.request("/v1/move/unfreeze", "POST");
  await rm(join(directory, "move-address"), { force: true });
  await rm(join(directory, "move-swap.bin"), { force: true });

  await rm(join(directory, "move-pin"), { force: true });
  await adapters.keychain.delete(`envden/${adapters.home}/move-token`);
}
```

## apps/cli/src/admin/move/abort.ts :: abortMove

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function abortMove(...args: Parameters<typeof lockedabortMove>) {
  return withStateLock(args[0].adapters.home, () => lockedabortMove(...args));
}
```

## apps/cli/src/admin/move/credentials.ts :: moveCredentials

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function moveCredentials(
  adapters: TAdapters,
  directory: string,
  options: { token?: string | undefined },
) {
  const savedPin = await optionalRead(join(directory, "move-pin"));
  const tokenSlot = `envden/${adapters.home}/move-token`;

  if (options.token)
    await adapters.keychain.set(tokenSlot, new TextEncoder().encode(options.token));

  const savedToken = await adapters.keychain.get(tokenSlot);

  const token = savedToken
    ? p.decodeToken("setup", new TextDecoder().decode(savedToken))
    : undefined;

  const pin = token?.serverPin ?? (savedPin ? binary(savedPin) : undefined);
  if (!pin) throw new EnvdenError("INVALID_INPUT", "A setup token is required for a new move");

  return { token, pin, tokenSlot };
}
```

## apps/cli/src/admin/move/follow.ts :: followServerMove

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function followServerMove(
  context: TAdminContext,
  history: THistory,
  fetcher: TFetch,
  unlock?: (client: ReturnType<typeof createClient>, vaultId: Uint8Array) => Promise<void>,
) {
  checkFloor(context.local, history);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);
  if (!moved || moved.body.kind !== 5) return { kind: "unchanged" as const };
  const target = moved.body.payload;
  if (context.local.server?.pin === text(target.newPin)) return { kind: "unchanged" as const };

  const header = history.headers.find((h) =>
    p.equal(h.body.listHead, p.objectHash(p.EntryCodec, moved, "entry")),
  );

  if (!header || header.body.op !== 10)
    throw new EnvdenError("INVALID_DATA", "Move header missing");

  await hello(target.newAddress, target.newPin, fetcher, MIN_SERVER);

  const client = createClient({
    address: target.newAddress,
    pin: target.newPin,
    vaultId: context.vaultId,
    identity: context.identity,
    version: VERSION,
    now: context.now,
    fetcher,
  });

  const swap: p.ISwap = {
    expectedHead: header.body.prev,
    header,
    entries: [moved],
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };

  await client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
  if (unlock) await unlock(client, context.vaultId);
  const destination = await readHistory(client, context.vaultId);

  checkFloor(
    {
      ...context.local,
      headers: history.headers.map((h) => text(p.signedCodec(p.ManifestHeaderCodec).write(h))),
    },
    destination,
  );

  if (!p.equal(destination.state.serverPin, target.newPin))
    throw new EnvdenError("INVALID_DATA", "Destination pin does not match the move");

  context.local.server = { address: target.newAddress, pin: text(target.newPin), protocol: 1 };
  await saveState(context.adapters.home, context.local, context.now);

  return { kind: "moved" as const, client };
}
```

## apps/cli/src/admin/move/resume.ts :: resumeMoveAddress

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function resumeMoveAddress(context: TAdminContext, directory: string) {
  const history = await currentHistory(context);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);
  const header = history.headers.at(-1)!;

  if (moved?.body.kind === 5 && header.body.op === 10) {
    await atomicWrite(join(directory, "move-pin"), text(moved.body.payload.newPin), context.now);

    await atomicWrite(
      join(directory, "move-swap.bin"),
      p.SwapCodec.write({
        expectedHead: header.body.prev,
        header,
        entries: [moved],
        files: undefined,
        keyring: undefined,
        envelope: undefined,
        skPub: undefined,
        opaqueRecord: undefined,
        approver: undefined,
      }),
      context.now,
    );

    return moved.body.payload.newAddress;
  }

  return undefined;
}
```

## apps/cli/src/admin/move/run.ts :: lockedmoveServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedmoveServer(
  adapters: TAdapters,
  options: {
    address?: string | undefined;
    token?: string | undefined;
    resume?: boolean | undefined;
    abort?: boolean | undefined;
    password: string;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const context = await adminContext(adapters, options.now, options.fetcher);
  await login(context.client, context.vaultId, options.password);
  const directory = join(adapters.home, "state");
  const savedAddress = await optionalRead(join(directory, "move-address"));
  let address = options.address ?? savedAddress;

  if (options.abort) {
    await abortMove(context, adapters, directory, address, options);

    return;
  }

  if (!address && options.resume) {
    address = await resumeMoveAddress(context, directory);
  }

  if (!address) throw new EnvdenError("INVALID_INPUT", "Specify the destination server");
  const { token, pin, tokenSlot } = await moveCredentials(adapters, directory, options);
  await hello(address, pin, options.fetcher, MIN_SERVER);

  const destination = createClient({
    address,
    pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now: options.now,
    fetcher: options.fetcher,
    version: VERSION,
    ...(token
      ? {
          proof: (request: p.IRequest) =>
            p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
        }
      : {}),
  });

  await atomicWrite(join(directory, "move-address"), address, adapters.now);
  await atomicWrite(join(directory, "move-pin"), text(pin), adapters.now);
  let swap: p.ISwap;

  swap = await preparedSwap(context, destination, directory, pin, address, options);

  requireDestination(swap, pin, address);

  await context.client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  await destination.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  await login(destination, context.vaultId, options.password);
  await switchServer(adapters, address, options.now, options.fetcher);
  await rm(join(directory, "move-swap.bin"), { force: true });
  await rm(join(directory, "move-address"), { force: true });
  await rm(join(directory, "move-pin"), { force: true });
  await adapters.keychain.delete(tokenSlot);
}
```

## apps/cli/src/admin/move/run.ts :: moveServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function moveServer(...args: Parameters<typeof lockedmoveServer>) {
  return withStateLock(args[0].home, () => lockedmoveServer(...args));
}
```

## apps/cli/src/admin/move/run.ts :: requireDestination

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function requireDestination(swap: p.ISwap, pin: Uint8Array, address: string) {
  const move = swap.entries[0]?.body;

  if (move?.kind !== 5 || !p.equal(move.payload.newPin, pin) || move.payload.newAddress !== address)
    throw new EnvdenError("INVALID_INPUT", "Resume destination differs from the stored move");
}
```

## apps/cli/src/admin/move/run.ts :: preparedSwap

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function preparedSwap(
  context: Awaited<ReturnType<typeof adminContext>>,
  destination: ReturnType<typeof createClient>,
  directory: string,
  pin: Uint8Array,
  address: string,
  options: Parameters<typeof lockedmoveServer>[1],
) {
  let swap: p.ISwap;

  try {
    swap = p.decode(p.SwapCodec, new Uint8Array(await readFile(join(directory, "move-swap.bin"))));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    await context.client.request("/v1/move/sk-pub");
    await destination.request("/v1/move/session", "POST");
    await context.client.request("/v1/move/freeze", "POST");
    const history = await currentHistory(context);
    await copyServer(context.client, destination, history);
    await registerPassword(destination, context.vaultId, options.password);

    const entry = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: history.state.seq + 1n,
        parent: history.state.head,
        kind: 5,
        payload: { oldPin: history.state.serverPin, newPin: pin, newAddress: address },
        signer: context.identity.record.id,
      },
      context.identity.keys.objSk,
      "entry",
    );

    swap = adminSwap(history, context.identity, 10, options.now(), { entries: [entry] });

    await atomicWrite(join(directory, "move-swap.bin"), p.encode(p.SwapCodec, swap), context.now);
  }

  return swap;
}
```

## apps/cli/src/admin/rejoin/classify.ts :: checkRejoin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function checkRejoin(adapters: TAdapters, history: THistory) {
  const local = await loadState(adapters.home);
  if (!local?.checkpoint) return;
  const identity = await deviceIdentity(adapters.keychain, adapters.home, local.deviceName);

  const result = classifyNonMember({
    deviceId: identity.record.id,
    storedHeaders: local.headers.map((h) =>
      p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(h)),
    ),
    storedEntries: local.entries.map((e) => p.decode(p.signedCodec(p.EntryCodec), binary(e))),
    verifiedHeaders: history.headers,
    verifiedEntries: history.entries,
    state: history.state,
  });

  if (result.kind === "fork" || result.kind === "rollback")
    throw new EnvdenError(
      result.kind === "fork" ? "FORK" : "ROLLBACK",
      "Rejoin history conflicts with the stored floor",
    );

  return result;
}
```

## apps/cli/src/admin/rejoin/classify.ts :: adoptRejoin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function adoptRejoin(adapters: TAdapters, history: THistory) {
  const result = await checkRejoin(adapters, history);

  return result;
}
```

## apps/cli/src/admin/rejoin/classify.ts :: rejoinIdentity

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function rejoinIdentity(adapters: TAdapters, name: string) {
  return deviceIdentity(adapters.keychain, `${adapters.home}/rejoin`, name);
}
```

## apps/cli/src/admin/rejoin/classify.ts :: finishRejoinIdentity

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function finishRejoinIdentity(adapters: TAdapters) {
  const next = await adapters.keychain.get(`envden/${adapters.home}/rejoin/device`);
  if (!next) throw new EnvdenError("INVALID_DATA", "Missing rejoin identity");
  await adapters.keychain.set(`envden/${adapters.home}/device`, next);
  await adapters.keychain.delete(`envden/${adapters.home}/rejoin/device`);

  for (const file of await readdir(join(adapters.home, "state")))
    if (file.startsWith("rejoin-floor-"))
      await rm(join(adapters.home, "state", file), { force: true });
}
```

## apps/cli/src/admin/rejoin/run.ts :: runRejoin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function runRejoin(
  adapters: TAdapters,
  address: string,
  options: TPreferenceOptions & {
    recoveryKit?: string;
    recovery?: boolean;
    name?: string;
    resume?: boolean;
  },
  now: () => number,
) {
  if (options.recoveryKit || options.recovery) {
    const name = await askDeviceName(options.name, adapters.hostname);
    const kit = await readKit(options.recoveryKit);

    await kitRejoin(adapters, {
      address,
      vaultId: kit.vaultId,
      secretKey: kit.secretKey,
      name,
      password: await secret("Master password"),
      now,
      fetcher: adapters.fetcher,
    });
  } else await pairingJoin(adapters, { ...options, address, now, rejoin: true });

  await completeJoin(adapters, now, undefined, options);
}
```

## apps/cli/src/admin/rejoin/kit.ts :: kitRejoin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function kitRejoin(
  adapters: Parameters<typeof kitJoin>[0],
  options: Parameters<typeof kitJoin>[1],
) {
  return kitJoin(adapters, { ...options, rejoin: true });
}
```

## apps/cli/src/admin/recovery/envelope.ts :: sealRecoveryEnvelope

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function sealRecoveryEnvelope(
  context: TAdminContext,
  history: THistory,
  keys: { encSk: Uint8Array; objSk: Uint8Array },
  password: string,
  secret: Uint8Array,
  now: () => number,
) {
  return p.sealEnvelope(
    {
      vaultId: context.vaultId,
      recoveryEncSk: keys.encSk,
      recoveryObjSk: keys.objSk,
      checkpoint: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
      sealedAt: BigInt(now()),
    },
    password,
    secret,
  );
}
```

## apps/cli/src/admin/recovery/pending.ts :: pendingPath

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function pendingPath(context: TAdminContext) {
  return join(context.adapters.home, "state", "kit-replace");
}
```

## apps/cli/src/admin/recovery/pending.ts :: savePendingKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function savePendingKit(context: TAdminContext, swap: p.ISwap) {
  return atomicWrite(pendingPath(context), text(p.SwapCodec.write(swap)), context.now);
}
```

## apps/cli/src/admin/recovery/pending.ts :: clearPendingKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function clearPendingKit(context: TAdminContext) {
  return rm(pendingPath(context), { force: true });
}

// Finishes a kit swap whose response was lost; an uncommitted one is dropped, so its kit never took effect.
```

## apps/cli/src/admin/recovery/pending.ts :: settlePendingKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function settlePendingKit(context: TAdminContext) {
  const saved = await optionalRead(pendingPath(context));
  if (!saved) return false;

  const swap = p.decode(p.SwapCodec, binary(saved));
  const history = await currentHistory(context);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");
  const committed = historyHasHeader(history, hash);

  if (committed) await acceptAdmin(context, swap, history);
  await clearPendingKit(context);

  return committed;
}
```

## apps/cli/src/admin/recovery/reset.ts :: attemptResetPassword

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function attemptResetPassword(
  adapters: TAdapters,
  password: string,
  kit: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const secret = p.decodeSecretKey(kit);
  const keys = p.generateRecoveryKeys();

  try {
    const context = await adminContext(adapters, now, fetcher, (request) =>
      p.signSKProof(secret, request.vaultId, request),
    );

    const history = await currentHistory(context);
    const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };
    const { change, keyring } = await nextEpoch(context, history, recovery);

    const entry = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: history.state.seq + 1n,
        parent: history.state.head,
        signer: context.identity.record.id,
        kind: 4,
        payload: { recovery, change },
      },
      context.identity.keys.objSk,
      "entry",
    );

    const record = await registerPassword(context.client, context.vaultId, password);

    const envelope = await sealRecoveryEnvelope(context, history, keys, password, secret, now);

    await commitAdmin(
      context,
      adminSwap(history, context.identity, 9, now(), {
        entries: [entry],
        keyring,
        envelope,
        opaqueRecord: new Uint8Array(Buffer.from(record, "base64url")),
      }),
    );
  } finally {
    secret.fill(0);
    keys.encSk.fill(0);
    keys.objSk.fill(0);
  }
}
```

## apps/cli/src/admin/recovery/reset.ts :: resetPassword

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function resetPassword(...args: Parameters<typeof attemptResetPassword>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptResetPassword(...args)));
}
```

## apps/cli/src/admin/recovery/credentials.ts :: attemptReplaceKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function attemptReplaceKit(
  adapters: TAdapters,
  password: string,
  now: () => number,
  fetcher: TFetch,
  material: IKitMaterial,
  removed?: Uint8Array,
) {
  const context = await adminContext(adapters, now, fetcher);
  if (await settlePendingKit(context)) return { kind: "finished" as const };

  await login(context.client, context.vaultId, password);
  const history = await currentHistory(context);
  const { keys, secret } = material;
  const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };
  const { change, keyring } = await nextEpoch(context, history, recovery, removed);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      signer: context.identity.record.id,
      ...(removed
        ? { kind: 2, payload: { device: removed, newRecovery: recovery, change } }
        : { kind: 4, payload: { recovery, change } }),
    },
    context.identity.keys.objSk,
    "entry",
  );

  const envelope = await sealRecoveryEnvelope(context, history, keys, password, secret, now);

  const swap = adminSwap(history, context.identity, removed ? 5 : 7, now(), {
    entries: [entry],
    keyring,
    envelope,
    skPub: p.skPub(secret, context.vaultId),
  });

  const kit = {
    vaultId: p.base32(context.vaultId),
    secretKey: p.encodeSecretKey(secret),
    server: context.local.server!.address,
  };

  await savePendingKit(context, swap);
  await material.show(kit);
  await commitAdmin(context, swap);
  await clearPendingKit(context);

  return { kind: "replaced" as const, kit };
}
```

## apps/cli/src/admin/recovery/credentials.ts :: attemptChangePassword

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function attemptChangePassword(
  adapters: TAdapters,
  oldPassword: string,
  newPassword: string,
  kit: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  await login(context.client, context.vaultId, oldPassword);
  const history = await currentHistory(context);
  const box = new Uint8Array(await (await context.client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), history.headers.at(-1)!.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const secret = p.decodeSecretKey(kit);
  const envelope = await p.openEnvelope(box, oldPassword, secret, context.vaultId);

  try {
    const record = await registerPassword(context.client, context.vaultId, newPassword);

    const sealed = await p.sealEnvelope(
      {
        ...envelope,
        checkpoint: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
        sealedAt: BigInt(now()),
      },
      newPassword,
      secret,
    );

    await commitAdmin(
      context,
      adminSwap(history, context.identity, 8, now(), {
        envelope: sealed,
        opaqueRecord: new Uint8Array(Buffer.from(record, "base64url")),
      }),
    );
  } finally {
    secret.fill(0);
    envelope.recoveryEncSk.fill(0);
    envelope.recoveryObjSk.fill(0);
  }
}

// The kit is shown before the swap is submitted, and once per call so head retries keep the same secret.
```

## apps/cli/src/admin/recovery/credentials.ts :: replaceKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function replaceKit(
  adapters: TAdapters,
  password: string,
  now: () => number,
  onKit: (kit: IReplacementKit) => Promise<void>,
  fetcher: TFetch = adapters.fetcher,
  removed?: Uint8Array,
) {
  return withStateLock(adapters.home, async () => {
    const keys = p.generateRecoveryKeys();
    const secret = p.randomBytes(16);
    let shown = false;

    const show = async (kit: IReplacementKit) => {
      if (shown) return;
      await onKit(kit);
      shown = true;
    };

    try {
      return await retryHead(() =>
        attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed),
      );
    } finally {
      keys.encSk.fill(0);
      keys.objSk.fill(0);
      secret.fill(0);
    }
  });
}
```

## apps/cli/src/admin/recovery/credentials.ts :: changePassword

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function changePassword(...args: Parameters<typeof attemptChangePassword>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptChangePassword(...args)));
}
```

## apps/cli/src/admin/shared/history.ts :: checkFloor

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function checkFloor(local: ILocalState, history: THistory) {
  const bySequence = new Map(history.headers.map((header) => [header.body.seq, header]));

  for (const encoded of local.headers) {
    const stored = p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(encoded));
    const remote = bySequence.get(stored.body.seq);

    if (!remote)
      throw new EnvdenError("ROLLBACK", "Server is behind this device; run envden server repair");

    if (
      !p.equal(
        p.objectHash(p.ManifestHeaderCodec, stored, "manifest"),
        p.objectHash(p.ManifestHeaderCodec, remote, "manifest"),
      )
    )
      throw new EnvdenError("FORK", "Server history conflicts with stored headers");
  }
}
```

## apps/cli/src/admin/shared/history.ts :: currentHistory

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function currentHistory(context: TAdminContext) {
  const history = await readHistory(context.client, context.vaultId);
  checkFloor(context.local, history);

  return history;
}
```

## apps/cli/src/admin/shared/context.ts :: adminContext

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function adminContext(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
  proof?: (request: p.IRequest) => Uint8Array,
) {
  const local = await loadState(adapters.home);

  if (!local?.server || !local.vaultId) throw new EnvdenError("NOT_FOUND", NOT_SET_UP);

  const identity = await deviceIdentity(adapters.keychain, adapters.home, local.deviceName);
  const vaultId = p.unbase32(local.vaultId);

  const client = createClient({
    address: local.server.address,
    pin: binary(local.server.pin),
    vaultId,
    identity,
    now,
    fetcher,
    version: VERSION,
    ...(proof ? { proof } : {}),
  });

  return { adapters, local, identity, vaultId, client, now };
}

export type TAdminContext = Awaited<ReturnType<typeof adminContext>>;
```

## apps/cli/src/admin/shared/epoch.ts :: nextEpoch

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function nextEpoch(
  context: TAdminContext,
  history: THistory,
  recovery = history.state.recovery,
  removed?: Uint8Array,
) {
  const { key, ring } = await currentMaterial(context, history);
  const nextKey = p.randomBytes(32);
  const epoch = history.state.epoch + 1;

  const members = [...history.state.devices.values()].filter(
    (device) => !removed || !p.equal(device.id, removed),
  );

  const wraps = await Promise.all(
    [...members, recovery].map((member) =>
      p.sealWrap(nextKey, context.vaultId, epoch, member.id, member.encPub),
    ),
  );

  wraps.sort((a, b) => p.compare(a.recipient, b.recipient));

  const keyring = p.sealKeyring(
    {
      vaultId: context.vaultId,
      epoch,
      idKey: ring.idKey,
      older: [...ring.older, { epoch: ring.epoch, key }],
    },
    nextKey,
  );

  return {
    change: { epoch, keyCommit: p.keyCommit(nextKey, context.vaultId, epoch), wraps },
    keyring,
  };
}
```

## apps/cli/src/admin/shared/transfer.ts :: optionalObject

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function optionalObject(client: TClient, path: string) {
  try {
    return new Uint8Array(await (await client.request(path)).arrayBuffer());
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "NOT_FOUND") return undefined;
    throw error;
  }
}
```

## apps/cli/src/admin/shared/transfer.ts :: historySwaps

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function historySwaps(
  history: THistory,
  files: (hash: Uint8Array) => Promise<Uint8Array | undefined>,
  after = 0n,
): Promise<p.ISwap[]> {
  const swaps: p.ISwap[] = [];
  let listSeq = -1n;

  for (const header of history.headers) {
    if (header.body.seq <= after) {
      listSeq = header.body.listSeq;
      continue;
    }

    const body = await files(header.body.filesHash);

    if (body && !p.equal(p.H("files", body), header.body.filesHash))
      throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

    swaps.push({
      expectedHead: header.body.prev,
      header,
      entries: history.entries.filter(
        (e) => e.body.seq > listSeq && e.body.seq <= header.body.listSeq,
      ),
      files: body ? p.decode(p.FilesCodec, body) : undefined,
      keyring: undefined,
      envelope: undefined,
      skPub: undefined,
      opaqueRecord: undefined,
      approver: undefined,
    });

    listSeq = header.body.listSeq;
  }

  return swaps;
}
```

## apps/cli/src/admin/shared/transfer.ts :: copyServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function copyServer(source: TClient, destination: TClient, history: THistory) {
  const hashes = p.ObjectsResponseSchema.parse(
    await (await source.request("/v1/blobs")).json(),
  ).objects;

  for (const hash of hashes) {
    const bytes = await optionalObject(source, `/v1/blobs/${hash}`);

    if (!bytes || text(p.H("blob", bytes)) !== hash)
      throw new EnvdenError("INVALID_DATA", "Move blob hash mismatch");

    await destination.request(`/v1/blobs/${hash}`, "PUT", bytes);
  }

  const swaps = await historySwaps(history, (hash) =>
    optionalObject(source, `/v1/files/${text(hash)}`),
  );

  await destination.request("/v1/move/chain", "POST", p.encode(p.list(p.SwapCodec), swaps));

  for (const header of history.headers) {
    const hash = header.body.keyringHash;
    const bytes = await optionalObject(source, `/v1/keyrings/${text(hash)}`);
    if (bytes) await destination.request(`/v1/move/material/keyring/${text(hash)}`, "PUT", bytes);
  }

  const envelope = await optionalObject(source, "/v1/envelope");
  const head = history.headers.at(-1)!;

  if (!envelope || !p.equal(p.H("envelope-blob", envelope), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Move envelope hash mismatch");

  await destination.request(
    `/v1/move/material/envelope/${text(head.body.envelopeHash)}`,
    "PUT",
    envelope,
  );

  const skPub = await optionalObject(source, "/v1/move/sk-pub");
  if (!skPub) throw new EnvdenError("INVALID_DATA", "Missing secret key public key");

  await destination.request(
    `/v1/move/material/skPub/${text(p.H("sk-public", skPub))}`,
    "PUT",
    skPub,
  );

  const period = p.UnlockPeriodSchema.parse(await (await source.request("/v1/move/period")).json());
  await destination.request("/v1/move/period", "PUT", period);
}
```

## apps/cli/src/admin/shared/commit.ts :: commitAdmin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function commitAdmin(context: TAdminContext, swap: p.ISwap) {
  const { history } = await submitAdmin(context, swap);

  await acceptAdmin(context, swap, history);
}
```

## apps/cli/src/admin/shared/commit.ts :: acceptAdmin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function acceptAdmin(context: TAdminContext, swap: p.ISwap, history: THistory) {
  const server = context.local.server;
  if (!server) throw new EnvdenError("NOT_FOUND", "Missing server configuration");

  await acceptJoin(
    context.adapters,
    context.client,
    context.identity,
    server.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  if (swap.envelope) {
    await atomicWrite(
      join(context.adapters.home, "state", "envelope.bin"),
      swap.envelope,
      context.now,
    );
  }
}
```

## apps/cli/src/admin/shared/submission.ts :: submitAdmin

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function submitAdmin(context: TAdminContext, swap: p.ISwap) {
  await context.client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
  const history = await readHistory(context.client, context.vaultId);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");

  if (!historyHasHeader(history, hash))
    throw new EnvdenError("INVALID_DATA", "Server did not commit the requested swap");

  return { history, swap };
}
```

## apps/cli/src/admin/shared/swap.ts :: adminSwap

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function adminSwap(
  history: THistory,
  identity: TDeviceIdentity,
  op: p.IManifestHeader["op"],
  now: number,
  fields: Partial<Omit<p.ISwap, "expectedHead" | "header">> = {},
): p.ISwap {
  const before = history.headers.at(-1)!;
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, before, "manifest");
  const entries = fields.entries ?? [];
  const last = entries.at(-1);
  const changed = last?.body;

  const epoch =
    changed && (changed.kind === 2 || changed.kind === 3 || changed.kind === 4)
      ? changed.payload.change.epoch
      : before.body.epoch;

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...before.body,
      seq: before.body.seq + 1n,
      prev: expectedHead,
      op,
      epoch,
      listSeq: last?.body.seq ?? before.body.listSeq,
      listHead: last ? p.objectHash(p.EntryCodec, last, "entry") : before.body.listHead,
      keyringHash: fields.keyring ? p.H("keyring-blob", fields.keyring) : before.body.keyringHash,
      envelopeHash: fields.envelope
        ? p.H("envelope-blob", fields.envelope)
        : before.body.envelopeHash,
      filesHash: fields.files
        ? p.H("files", p.encode(p.FilesCodec, fields.files))
        : before.body.filesHash,
      createdAt: BigInt(now),
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "manifest",
  );

  return {
    expectedHead,
    header,
    entries,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
    ...fields,
  };
}
```

## apps/cli/src/admin/shared/material.ts :: currentMaterial

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function currentMaterial(context: TAdminContext, history: THistory) {
  const head = history.headers.at(-1)!;
  const wrap = deviceWrap(history.entries, context.identity.record.id);

  const commit = history.state.commits.get(head.body.epoch);
  if (!wrap || !commit) throw new EnvdenError("UNAUTHORIZED", "Device is no longer a member");

  const key = await p.openWrap(
    wrap,
    context.identity.keys.encSk,
    context.identity.record.encPub,
    context.vaultId,
    head.body.epoch,
    commit,
  );

  const box = new Uint8Array(
    await (
      await context.client.request(`/v1/keyrings/${text(head.body.keyringHash)}`)
    ).arrayBuffer(),
  );

  if (!p.equal(p.H("keyring-blob", box), head.body.keyringHash))
    throw new EnvdenError("INVALID_DATA", "Keyring hash mismatch");

  const knownId = await context.adapters.keychain.get(`envden/${context.adapters.home}/id-key`);

  const ring = p.openKeyring(
    box,
    key,
    context.vaultId,
    head.body.epoch,
    history.state.commits,
    knownId ?? undefined,
  );

  const keys = new Map([
    ...ring.older.map((item) => [item.epoch, item.key] as const),
    [ring.epoch, key] as const,
  ]);

  return { key, ring, keys };
}
```

## apps/cli/src/admin/repair/finish.ts :: attemptFinishRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function attemptFinishRepair(
  adapters: TAdapters,
  options: {
    token: string;
    password: string;
    without?: string[] | undefined;
    acceptLost?: boolean | undefined;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const resumed = await resumeClose(adapters, options.token, options.now, options.fetcher);
  if (resumed) return resumed;
  const context = await repairContext(adapters, options.token, options.now, options.fetcher);
  let history: THistory = await readHistory(context.client, context.vaultId);

  const status = p.RepairStatusSchema.parse(
    await (await context.client.request("/v1/repair/status")).json(),
  );

  if (!p.equal(binary(status.repairId), context.repairId))
    throw new EnvdenError("INVALID_DATA", "Repair identity mismatch");

  history = await dropDevices(context, history, options.without ?? []);

  const reports = await repairReports(context, history);

  const missing = missingReportMembers(history.state, reports);

  if (missing.length)
    return { kind: "missing-reports" as const, devices: missing.map((d) => d.name) };

  const files = await repairFiles(context, history);

  const available = await availableBlobs(context);

  const gaps = classifyMissingBlobs(files, available, reports);

  if (deriveGapAction(gaps, options.acceptLost).kind === "report") {
    return missingBlobNames(context, history, gaps);
  }

  if (gaps.lost.length) {
    await fixLost(context, history, files, gaps.lost, available, context.repairId);
    history = await readHistory(context.client, context.vaultId);
  }

  await closeRepair(adapters, context, history, status, options);

  const result = await resumeClose(adapters, options.token, options.now, options.fetcher);
  if (!result) throw new EnvdenError("INVALID_DATA", "Repair close was not committed");

  return result;
}
```

## apps/cli/src/admin/repair/finish.ts :: finishRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function finishRepair(...args: Parameters<typeof attemptFinishRepair>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptFinishRepair(...args)));
}
```

## apps/cli/src/admin/repair/drop.ts :: dropDevices

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function dropDevices(context: TAdminContext, initial: THistory, without: string[]) {
  let history = initial;

  for (const name of without) {
    const device = [...history.state.devices.values()].find(
      (d) => d.name === name || p.base32(d.id) === name,
    );

    if (!device) continue;

    if (p.equal(device.id, context.identity.record.id) || history.state.devices.size === 1)
      throw new EnvdenError("INVALID_INPUT", "Cannot drop this device or the last device");

    const swap = await revocationSwap(context, history, device, context.now());
    history = (await submitAdmin(context, swap)).history;
  }

  return history;
}
```

## apps/cli/src/admin/repair/login.ts :: repairLogin

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function repairLogin(
  client: TClient,
  vaultId: Uint8Array,
  password: string,
  kind: "login" | "register",
) {
  const identifiers = p.unlockIdentifiers(vaultId).identifiers;

  if (kind === "register") {
    const start = await p.opaqueStartRegistration(password);

    const body = p.MessageResponseSchema.parse(
      await (
        await client.request("/v1/opaque/registration/start", "POST", {
          message: start.registrationRequest,
        })
      ).json(),
    );

    const finish = await p.opaqueFinishRegistration({
      password,
      registrationResponse: body.message,
      clientRegistrationState: start.clientRegistrationState,
      identifiers,
    });

    return { kind: "registration" as const, message: finish.registrationRecord };
  }

  const start = await p.opaqueStartLogin(password);

  const body = p.MessageResponseSchema.parse(
    await (
      await client.request("/v1/opaque/login/start", "POST", {
        purpose: "unlock",
        message: start.startLoginRequest,
      })
    ).json(),
  );

  const finish = await p.opaqueFinishLogin({
    password,
    loginResponse: body.message,
    clientLoginState: start.clientLoginState,
    identifiers,
  });

  if (!finish) throw new EnvdenError("UNAUTHORIZED", "Password login failed");

  return { kind: "login" as const, purpose: "unlock" as const, message: finish.finishLoginRequest };
}
```

## apps/cli/src/admin/repair/lost.ts :: fixLost

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function fixLost(
  context: TAdminContext,
  history: THistory,
  files: p.IFiles,
  lost: p.IFileEntry[],
  available: ReadonlySet<string>,
  repairId: Uint8Array,
) {
  const { key, ring, keys } = await currentMaterial(context, history);

  const older = await Promise.all(
    history.headers.map(async (header) => {
      const bytes = await optionalObject(
        context.client,
        `/v1/files/${text(header.body.filesHash)}`,
      );

      if (bytes && !p.equal(p.H("files", bytes), header.body.filesHash))
        throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

      return { header: header.body, files: bytes ? p.decode(p.FilesCodec, bytes) : undefined };
    }),
  );

  const losses = new Set(lost.map((e) => text(e.fileId)));
  const entries: p.IFileEntry[] = [];
  const report: string[] = [];

  for (const file of files.entries) {
    if (!losses.has(text(file.fileId))) {
      entries.push(file);
      continue;
    }

    const c = {
      vaultId: context.vaultId,
      epoch: file.epoch,
      fileId: file.fileId,
      version: file.version,
    };

    const name = p.openFileName(file.name, keys.get(file.epoch)!, ring.idKey, c);
    const next = { ...c, epoch: ring.epoch, version: file.version + 1n };

    const candidate = chooseRecoveryCandidate({
      fileId: file.fileId,
      beforeVersion: file.version,
      history: older,
      availableBlobs: available,
    });

    let blobHash: Uint8Array = new Uint8Array(32);
    let state: p.IFileEntry["state"] = 4;

    if (candidate.kind === "recovered") {
      const entry = candidate.entry;
      const box = await optionalObject(context.client, `/v1/blobs/${text(entry.blobHash)}`);

      if (box) {
        const old = { ...c, epoch: entry.epoch, version: entry.version };

        const content = p.openFile(
          box,
          keys.get(entry.epoch)!,
          ring.idKey,
          old,
          entry.blobHash,
          name,
        );

        const blob = p.sealFile(content, key, next);
        blobHash = p.H("blob", blob);
        await context.client.request(`/v1/blobs/${text(blobHash)}`, "PUT", blob);
        state = 3;
      }
    }

    report.push(
      `${name.repoId}/${name.path}: ${state === 3 && candidate.kind === "recovered" ? `recovered from ${whenText(Number(candidate.header.createdAt), context.now())}` : "lost; no verified older copy"}`,
    );

    entries.push({
      ...file,
      epoch: next.epoch,
      version: next.version,
      state,
      blobHash,
      name: p.sealFileName(name, key, next),
    });
  }

  const swap = adminSwap(history, context.identity, 11, context.now(), { files: { entries } });

  await atomicWrite(
    join(context.adapters.home, "state", `repair-report-${text(repairId)}`),
    report.join("\n"),
    context.now,
  );

  await submitAdmin(context, swap);
}
```

## apps/cli/src/admin/repair/chain.ts :: localRepairChain

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function localRepairChain(encoded: string[]) {
  const entries = encoded.map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), new Uint8Array(Buffer.from(value, "base64url"))),
  );

  return { entries, chain: verifyChain(entries) };
}
```

## apps/cli/src/admin/repair/upload.ts :: cachedBytes

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function cachedBytes(path: string) {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
```

## apps/cli/src/admin/repair/upload.ts :: repairContext

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function repairContext(
  adapters: TAdapters,
  tokenText: string,
  now: () => number,
  fetcher: TFetch,
) {
  const token = p.decodeToken("repair", tokenText);

  const context = await adminContext(adapters, now, fetcher, (request) =>
    p.tokenProof("repair", p.tokenKey("repair", token.secret), request),
  );

  if (!context.local.server || !p.equal(binary(context.local.server.pin), token.serverPin))
    throw new EnvdenError("INVALID_INPUT", "Repair token is for another server");

  const { chain } = localRepairChain(context.local.entries);
  const repairId = p.H("repair-id", token.secret);

  if (chain.kind !== "valid" || isReusedRepairToken(repairId, chain.state.repairIds))
    throw new EnvdenError("INVALID_DATA", "Repair token was already used");

  return { ...context, repairId };
}
```

## apps/cli/src/admin/repair/upload.ts :: lockeduploadRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockeduploadRepair(
  adapters: TAdapters,
  token: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await repairContext(adapters, token, now, fetcher);
  const remote = await readHistory(context.client, context.vaultId);

  const headers = context.local.headers.map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const { entries, chain } = localRepairChain(context.local.entries);
  if (chain.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid stored chain");
  const stored = { headers, entries, state: chain.state };
  const remoteHead = remote.headers.at(-1)!;
  const evidence = join(adapters.home, "state", `repair-restored-${text(context.repairId)}`);

  if ((await optionalRead(evidence)) === undefined)
    await atomicWrite(
      evidence,
      text(p.objectHash(p.ManifestHeaderCodec, remoteHead, "manifest")),
      adapters.now,
    );

  const localHead = headers.at(-1)!;

  if (localHead.body.seq > remoteHead.body.seq)
    checkFloor(
      {
        ...context.local,
        headers: remote.headers.map((h) => text(p.signedCodec(p.ManifestHeaderCodec).write(h))),
      },
      stored,
    );
  else checkFloor(context.local, remote);

  const files = context.local.files
    ? p.decode(p.FilesCodec, binary(context.local.files))
    : { entries: [] };

  const blobs = await uploadCachedBlobs(context, files);

  if (localHead.body.seq > remoteHead.body.seq) {
    const swaps = await historySwaps(
      stored,
      async (hash) => {
        if (context.local.files && p.equal(p.H("files", binary(context.local.files)), hash))
          return binary(context.local.files);

        return cachedBytes(join(adapters.home, "state", "file-lists", text(hash)));
      },
      remoteHead.body.seq,
    );

    await context.client.request("/v1/repair/chain", "POST", p.encode(p.list(p.SwapCodec), swaps));
  }

  if (context.local.keyring)
    await context.client.request(
      `/v1/repair/material/keyring/${text(localHead.body.keyringHash)}`,
      "PUT",
      binary(context.local.keyring),
    );

  const envelope = await cachedBytes(join(adapters.home, "state", "envelope.bin"));

  const repaired = await readHistory(context.client, context.vaultId);

  if (
    envelope &&
    p.equal(p.H("envelope-blob", envelope), repaired.headers.at(-1)!.body.envelopeHash)
  )
    await context.client.request(
      `/v1/repair/material/envelope/${text(p.H("envelope-blob", envelope))}`,
      "PUT",
      envelope,
    );

  const history = await readHistory(context.client, context.vaultId);

  await acceptJoin(
    adapters,
    context.client,
    context.identity,
    context.local.server!.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  blobs.sort(p.compare);

  const report = p.signObject(
    p.RepairReportCodec,
    {
      vaultId: context.vaultId,
      repairId: context.repairId,
      head: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
      blobs,
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "repair-report",
  );

  await context.client.request(
    "/v1/repair/report",
    "PUT",
    p.signedCodec(p.RepairReportCodec).write(report),
  );

  return context;
}
```

## apps/cli/src/admin/repair/upload.ts :: uploadRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function uploadRepair(...args: Parameters<typeof lockeduploadRepair>) {
  return withStateLock(args[0].home, () => lockeduploadRepair(...args));
}
```

## apps/cli/src/admin/repair/upload.ts :: uploadCachedBlobs

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function uploadCachedBlobs(
  context: Awaited<ReturnType<typeof repairContext>>,
  files: p.IFiles,
) {
  const adapters = context.adapters;
  const blobs: Uint8Array[] = [];

  for (const file of files.entries) {
    if (![1, 3].includes(file.state)) continue;
    const bytes = await cachedBytes(join(adapters.home, "state", "blobs", text(file.blobHash)));
    if (!bytes) continue;

    if (!p.equal(p.H("blob", bytes), file.blobHash))
      throw new EnvdenError("INVALID_DATA", "Cached blob hash mismatch");

    await context.client.request(`/v1/blobs/${text(file.blobHash)}`, "PUT", bytes);
    blobs.push(file.blobHash);
  }

  return blobs;
}
```

## apps/cli/src/admin/repair/resume.ts :: saveClose

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function saveClose(adapters: TAdapters, swap: p.ISwap) {
  await atomicWrite(
    join(adapters.home, "state", "repair-close"),
    text(p.SwapCodec.write(swap)),
    adapters.now,
  );
}
```

## apps/cli/src/admin/repair/resume.ts :: resumeClose

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function resumeClose(
  adapters: TAdapters,
  token: string,
  now: () => number,
  fetcher: TFetch,
) {
  const saved = await optionalRead(join(adapters.home, "state", "repair-close"));
  if (!saved) return;
  const swap = p.decode(p.SwapCodec, binary(saved));
  const close = swap.entries[0]?.body;
  const repairId = p.H("repair-id", p.decodeToken("repair", token).secret);

  if (close?.kind !== 6 || !p.equal(close.payload.repairId, repairId)) {
    await rm(join(adapters.home, "state", "repair-close"), { force: true });

    return;
  }

  const context = await adminContext(adapters, now, fetcher);
  let history;

  try {
    history = await readHistory(context.client, context.vaultId);
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "RESTORED_MODE") return;
    throw error;
  }

  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");

  if (!historyHasHeader(history, hash)) {
    await rm(join(adapters.home, "state", "repair-close"), { force: true });
    throw new EnvdenError("FORK", "Repair close is not on the server chain");
  }

  await acceptJoin(
    adapters,
    context.client,
    context.identity,
    context.local.server!.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  const envelope = await optionalObject(context.client, "/v1/envelope");

  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), close.payload.restoredHead),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Missing restored checkpoint");

  const result = {
    kind: "finished" as const,
    report: await optionalRead(join(adapters.home, "state", `repair-report-${text(repairId)}`)),
    replaceKit: refuseSecretKeyProof(
      history.headers
        .slice(restoredIndex + 1)
        .filter((h) => h.body.seq < swap.header.body.seq)
        .map((h) => h.body),
      !!envelope && p.equal(p.H("envelope-blob", envelope), swap.header.body.envelopeHash),
    ),
  };

  await rm(join(adapters.home, "state", "repair-close"), { force: true });

  return result;
}
```

## apps/cli/src/admin/devices/rotate.ts :: attemptRotateVault

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function attemptRotateVault(
  adapters: TAdapters,
  password: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  await login(context.client, context.vaultId, password);
  const history = await currentHistory(context);
  const { change, keyring } = await nextEpoch(context, history);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 3,
      payload: { change },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  await commitAdmin(
    context,
    adminSwap(history, context.identity, 6, now(), { entries: [entry], keyring }),
  );
}
```

## apps/cli/src/admin/devices/rotate.ts :: rotateVault

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function rotateVault(...args: Parameters<typeof attemptRotateVault>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRotateVault(...args)));
}
```

## apps/cli/src/admin/devices/revocation.ts :: revocationSwap

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function revocationSwap(
  context: TAdminContext,
  history: THistory,
  device: { id: Uint8Array },
  now: number,
) {
  const { change, keyring } = await nextEpoch(context, history, history.state.recovery, device.id);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 2,
      payload: { device: device.id, newRecovery: undefined, change },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  return adminSwap(history, context.identity, 4, now, { entries: [entry], keyring });
}
```

## apps/cli/src/admin/devices/recovery-holders.ts :: recoveryHolders

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function recoveryHolders(history: THistory): ReadonlySet<string> {
  const holders = new Set<string>();

  for (let index = 0; index < history.headers.length; index++) {
    const header = history.headers[index]!;
    const previous = history.headers[index - 1];

    if (!previous || !p.equal(previous.body.envelopeHash, header.body.envelopeHash))
      holders.add(p.base32(header.body.signer));
  }

  for (const signed of history.entries) {
    const entry = signed.body;

    if (
      entry.kind === 1 &&
      !history.entries.some((item) =>
        item.body.kind === 0
          ? p.equal(item.body.payload.device.id, entry.signer)
          : item.body.kind === 1 && p.equal(item.body.payload.device.id, entry.signer),
      )
    )
      holders.add(p.base32(entry.payload.device.id));
  }

  return holders;
}
```

## apps/cli/src/admin/devices/exposed-file.ts :: inspectExposedFile

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function inspectExposedFile(
  context: TAdminContext,
  entry: p.IFileEntry,
  keys: Map<number, Uint8Array>,
  ring: Awaited<ReturnType<typeof currentMaterial>>["ring"],
  names: Map<string, { repoId: string; path: string; keys: Set<string> }>,
) {
  const c = {
    vaultId: context.vaultId,
    epoch: entry.epoch,
    fileId: entry.fileId,
    version: entry.version,
  };

  const name = openedName(entry, keys, ring.idKey, context.vaultId);
  if (!name) return true;

  const id = text(entry.fileId);
  const found = names.get(id) ?? { ...name, keys: new Set<string>() };
  names.set(id, found);
  if (![1, 3].includes(entry.state)) return false;
  const box = await retainedBlob(context.client, entry.blobHash);

  if (!box) {
    return true;
  }

  const content = p.openFile(box, keys.get(entry.epoch)!, ring.idKey, c, entry.blobHash, name);
  const parsed = parseEnv(content.content);

  if (parsed.kind === "parsed")
    for (const assignment of parsed.entries) found.keys.add(assignment.key);
  else return true;

  return false;
}
```

## apps/cli/src/admin/devices/remove.ts :: attemptRemoveDevice

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
async function attemptRemoveDevice(
  adapters: TAdapters,
  name: string,
  password: string | (() => Promise<string>),
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
  newKit = false,
  recommend?: () => Promise<boolean>,
  confirm?: (exposure: Awaited<ReturnType<typeof exposedNames>>) => Promise<boolean>,
  onKit?: (kit: IReplacementKit) => Promise<void>,
) {
  const context = await adminContext(adapters, now, fetcher);
  const target = await removalTarget(context, name);
  if (!target) return { kind: "finished" as const };
  const { history, device } = target;

  const credential = typeof password === "string" ? password : await password();
  await login(context.client, context.vaultId, credential);
  const exposure = await exposedNames(context, history);

  if (confirm && !(await confirm(exposure)))
    throw new EnvdenError("INVALID_INPUT", "Device removal cancelled");

  const recommendNewKit = recoveryHolders(history).has(p.base32(device.id));

  const replace = newKit || (recommendNewKit && recommend ? await recommend() : false);

  if (replace) await replaceKit(adapters, credential, now, kitOutput(onKit), fetcher, device.id);
  else await commitAdmin(context, await revocationSwap(context, history, device, now()));

  return { kind: "removed" as const, recommendNewKit, exposure };
}
```

## apps/cli/src/admin/devices/remove.ts :: removeDevice

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function removeDevice(...args: Parameters<typeof attemptRemoveDevice>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRemoveDevice(...args)));
}

// A settled removal whose device is already gone counts as this removal finishing.
```

## apps/cli/src/admin/devices/remove.ts :: removalTarget

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function removalTarget(context: TAdminContext, name: string) {
  const finished = await settlePendingKit(context);
  const history = await currentHistory(context);
  if (finished && !findDevice(history, name)) return undefined;

  return { history, device: removableDevice(history, context.identity.record.id, name) };
}
```

## apps/cli/src/admin/devices/remove.ts :: kitOutput

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
function kitOutput(onKit?: (kit: IReplacementKit) => Promise<void>) {
  if (!onKit) throw new EnvdenError("INTERNAL", "Missing recovery kit output");

  return onKit;
}
```

## apps/cli/src/admin/devices/remove.ts :: removableDevice

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function removableDevice(
  history: Awaited<ReturnType<typeof currentHistory>>,
  ownId: Uint8Array,
  name: string,
) {
  const device = findDevice(history, name);

  if (!device) throw new EnvdenError("NOT_FOUND", "Device not found");

  if (p.equal(device.id, ownId) || history.state.devices.size === 1)
    throw new EnvdenError("INVALID_INPUT", "Cannot remove this device or the last device");

  return device;
}
```

## apps/cli/src/admin/devices/remove.ts :: findDevice

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function findDevice(history: Awaited<ReturnType<typeof currentHistory>>, name: string) {
  return [...history.state.devices.values()].find(
    (item) => item.name === name || p.base32(item.id) === name,
  );
}
```

## apps/cli/src/admin/devices/exposure.ts :: exposedNames

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function exposedNames(context: TAdminContext, history: THistory) {
  const { ring, keys } = await currentMaterial(context, history);

  const names = new Map<string, { repoId: string; path: string; keys: Set<string> }>();
  let incomplete = false;

  const lists = new Set<string>();
  const blobs = new Set<string>();

  for (const header of history.headers) {
    const hash = text(header.body.filesHash);
    if (lists.has(hash)) continue;
    lists.add(hash);
    const files = await retainedList(context.client, header.body.filesHash);

    if (!files) {
      incomplete = true;
      continue;
    }

    for (const entry of files.entries) {
      const blob = text(entry.blobHash);
      if (blobs.has(blob)) continue;
      blobs.add(blob);
      if (await inspectExposedFile(context, entry, keys, ring, names)) incomplete = true;
    }
  }

  return {
    files: [...names.values()].map((name) => ({
      repoId: name.repoId,
      path: name.path,
      keys: [...name.keys].sort(),
    })),
    incomplete,
  };
}
```

## apps/cli/src/admin/devices/rename.ts :: renameCheck

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function renameCheck(
  devices: Iterable<p.IDeviceRecord>,
  ownId: Uint8Array,
  name: string,
): "rename" | "unchanged" | "taken" | "invalid" {
  if (!p.isDeviceName(name)) return "invalid";

  const holder = [...devices].find((device) => device.name === name);
  if (!holder) return "rename";

  return p.equal(holder.id, ownId) ? "unchanged" : "taken";
}
```

## apps/cli/src/admin/devices/rename.ts :: attemptRenameDevice

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function attemptRenameDevice(
  adapters: TAdapters,
  name: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const own = context.identity.record.id;
  const check = renameCheck(history.state.devices.values(), own, name);

  if (check === "unchanged") return { kind: "unchanged" as const };
  if (check === "taken") throw new EnvdenError("INVALID_INPUT", "Another device has that name");

  if (check === "invalid")
    throw new EnvdenError(
      "INVALID_INPUT",
      "Device names are 1-64 bytes with no invisible characters",
    );

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 7,
      payload: { device: own, name },
      signer: own,
    },
    context.identity.keys.objSk,
    "entry",
  );

  await commitAdmin(context, adminSwap(history, context.identity, 13, now(), { entries: [entry] }));

  return { kind: "renamed" as const };
}
```

## apps/cli/src/admin/devices/rename.ts :: renameDevice

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function renameDevice(...args: Parameters<typeof attemptRenameDevice>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRenameDevice(...args)));
}
```

## apps/cli/src/admin/devices/list.ts :: listDevices

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function listDevices(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const holders = recoveryHolders(history);

  const seen = p.DevicesResponseSchema.parse(
    await (await context.client.request("/v1/devices")).json(),
  ).devices;

  return [...history.state.devices.values()].map((device) => ({
    id: p.base32(device.id),
    name: device.name,
    clientVersion: seen.find((item) => item.id === text(device.id))?.clientVersion ?? null,
    unconfirmed: !seen.find((item) => item.id === text(device.id))?.confirmed,
    recoveryKeyHeld: holders.has(p.base32(device.id)),
    current: p.equal(device.id, context.identity.record.id),
  }));
}
```

## apps/cli/src/admin/repair/completion/gaps.ts :: deriveGapAction

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function deriveGapAction(
  gaps: { missing: unknown[]; lost: unknown[] },
  acceptLost: boolean | undefined,
) {
  if (gaps.missing.length || (gaps.lost.length && !acceptLost)) return { kind: "report" } as const;

  return { kind: "finish" } as const;
}
```

## apps/cli/src/admin/repair/completion/blobs.ts :: availableBlobs

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function availableBlobs(context: Awaited<ReturnType<typeof repairContext>>) {
  const hashes = p.ObjectsResponseSchema.parse(
    await (await context.client.request("/v1/blobs")).json(),
  ).objects;

  const available = new Set<string>();

  for (const hash of hashes) {
    const blob = await optionalObject(context.client, `/v1/blobs/${hash}`);
    if (!blob) continue;

    if (!p.equal(p.H("blob", blob), binary(hash)))
      throw new EnvdenError("INVALID_DATA", "Repair blob hash mismatch");

    available.add(p.base32(binary(hash)));
  }

  return available;
}
```

## apps/cli/src/admin/repair/completion/reports.ts :: repairReports

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function repairReports(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: THistory,
) {
  const encoded = p.ObjectsResponseSchema.parse(
    await (await context.client.request("/v1/repair/reports")).json(),
  ).objects;

  const reports = filterRepairReports({
    reports: encoded.flatMap((r) => {
      const result = decodeServerObject({
        received: binary(r),
        codec: p.RepairReportCodec,
        label: "repair-report",
        mismatch: "fork",
        members: [...history.state.devices.values()],
        currentVersion: VERSION,
        latestVersion: context.local.latest ?? VERSION,
      });

      if (result.kind === "known") return [result.value];

      if (result.kind === "update-required")
        throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

      if (result.kind === "unreadable")
        throw new EnvdenError("INVALID_DATA", "Unreadable data from server");

      return [];
    }),
    repairId: context.repairId,
    state: history.state,
    headerHashes: new Set(
      history.headers.map((h) => p.base32(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))),
    ),
  });

  return reports;
}
```

## apps/cli/src/admin/repair/completion/names.ts :: missingBlobNames

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function missingBlobNames(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  gaps: ReturnType<typeof classifyMissingBlobs>,
) {
  const { key, ring } = await currentMaterial(context, history);

  const keys = new Map([
    ...ring.older.map((e) => [e.epoch, e.key] as const),
    [ring.epoch, key] as const,
  ]);

  const name = (entry: p.IFileEntry) =>
    p.openFileName(entry.name, keys.get(entry.epoch)!, ring.idKey, {
      vaultId: context.vaultId,
      epoch: entry.epoch,
      fileId: entry.fileId,
      version: entry.version,
    });

  return {
    kind: "missing-blobs" as const,
    missing: gaps.missing.map(name),
    lost: gaps.lost.map(name),
  };
}
```

## apps/cli/src/admin/repair/completion/close.ts :: closeRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function closeRepair(
  adapters: TAdapters,
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  status: ReturnType<typeof p.RepairStatusSchema.parse>,
  options: { password: string; now: () => number },
) {
  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), binary(status.restoredHead)),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Restored head is not on the chain");

  const evidence = await optionalRead(
    join(adapters.home, "state", `repair-restored-${text(context.repairId)}`),
  );

  const evidenceIndex = history.headers.findIndex(
    (h) => evidence === text(p.objectHash(p.ManifestHeaderCodec, h, "manifest")),
  );

  if (evidenceIndex < restoredIndex)
    throw new EnvdenError("INVALID_DATA", "Restored head exceeds the observed restore point");

  const after = history.headers.slice(restoredIndex + 1).map((h) => h.body);

  const finish = await repairLogin(
    context.client,
    context.vaultId,
    options.password,
    repairLoginDecision(after),
  );

  const record = finish.kind === "registration" ? binary(finish.message) : undefined;

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 6,
      payload: { repairId: context.repairId, restoredHead: binary(status.restoredHead) },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  const swap = adminSwap(history, context.identity, 12, options.now(), {
    entries: [entry],
    ...(record ? { opaqueRecord: record } : {}),
  });

  await saveClose(adapters, swap);

  await context.client.request("/v1/repair/finish", "POST", {
    ...finish,
    swap: text(p.SwapCodec.write(swap)),
  });
}
```

## apps/cli/src/admin/repair/completion/files.ts :: repairFiles

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function repairFiles(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
) {
  const head = history.headers.at(-1)!;

  const fileBytes = new Uint8Array(
    await (await context.client.request(`/v1/files/${text(head.body.filesHash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H("files", fileBytes), head.body.filesHash))
    throw new EnvdenError("INVALID_DATA", "Repair file list hash mismatch");

  const files = p.decode(p.FilesCodec, fileBytes);

  return files;
}
```

## apps/cli/src/vault/genesis.ts :: createGenesis

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function createGenesis(identity: TDeviceIdentity, pin: Uint8Array, now: number) {
  const recoveryKeys = p.generateRecoveryKeys();

  const recovery = {
    id: p.recoveryId(recoveryKeys),
    encPub: recoveryKeys.encPub,
    objPub: recoveryKeys.objPub,
  };

  const genesis = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: new Uint8Array(32),
      seq: 0n,
      parent: new Uint8Array(32),
      kind: 0,
      payload: {
        serverPin: pin,
        device: identity.record,
        recovery,
        vaultNonce: p.randomBytes(32),
        createdAt: BigInt(now),
      },
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "entry",
  );

  const vaultId = p.objectHash(p.EntryCodec, genesis, "entry");
  const epochKey = p.randomBytes(32);

  const wraps = await Promise.all(
    [identity.record, recovery].map((member) =>
      p.sealWrap(epochKey, vaultId, 1, member.id, member.encPub),
    ),
  );

  wraps.sort((a, b) => p.compare(a.recipient, b.recipient));

  const epoch = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId,
      seq: 1n,
      parent: vaultId,
      signer: identity.record.id,
      kind: 3,
      payload: { change: { epoch: 1, keyCommit: p.keyCommit(epochKey, vaultId, 1), wraps } },
    },
    identity.keys.objSk,
    "entry",
  );

  const idKey = p.randomBytes(32);
  const keyring = p.sealKeyring({ vaultId, epoch: 1, idKey, older: [] }, epochKey);

  return { vaultId, genesis, epoch, keyring, epochKey, idKey, recoveryKeys };
}

export type TGenesis = Awaited<ReturnType<typeof createGenesis>>;
```

## apps/cli/src/vault/history.ts :: objects

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function objects(client: TClient, path: string, from: bigint): Promise<string[]> {
  const result: string[] = [];

  while (true) {
    const value: unknown = await (await client.request(`${path}?from=${from}`)).json();
    const page = p.ObjectsResponseSchema.parse(value).objects;
    if (!page.length) return result;
    const last = binary(page.at(-1)!);

    const seq = p.u64.read(new p.Reader(last.subarray(34, 42)));

    if (seq < from) throw new EnvdenError("INVALID_DATA", "Invalid history page");
    result.push(...page);
    from = seq + 1n;
  }
}
```

## apps/cli/src/vault/history.ts :: readHistory

DONE comparison: stored entry/header decode order fixed in 646eb49; failing-first red-history-order.log and passing final-cli-2.log.

Ordered steps, including branches:

```ts
export async function readHistory(
  client: TClient,
  vaultId: Uint8Array,
  local?: {
    entries: string[];
    headers: string[];
    latest?: string;
    verifiedState?: IDeviceListState;
  },
): Promise<THistory> {
  const entries = (local?.entries ?? []).map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  const headers = (local?.headers ?? []).map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const states = new Map<bigint, IDeviceListState>();
  const state = storedState(entries, anchoredState(entries, local?.verifiedState), states);

  const incoming = await objects(client, "/v1/entries", (entries.at(-1)?.body.seq ?? -1n) + 1n);

  const decoded = decodeHistoryEntries(
    incoming.map(binary),
    local?.entries.map(binary),
    local?.latest,
    state,
  );

  entries.push(...decoded.entries);
  for (const [seq, at] of decoded.states) states.set(seq, at);
  const finalState = decoded.state;
  const firstHeader = headers.length;

  const incomingHeaders = await objects(
    client,
    "/v1/headers",
    (headers.at(-1)?.body.seq ?? 0n) + 1n,
  );

  for (const value of incomingHeaders)
    headers.push(
      decodeHistoryHeader(
        binary(value),
        entries,
        local?.headers.map(binary),
        local?.latest,
        states,
      ),
    );

  if (!p.equal(finalState.vaultId, vaultId) || headers.length === 0)
    throw new EnvdenError("INVALID_DATA", "Invalid vault history");

  verifyNewHeaders(headers, firstHeader, states, vaultId);
  verifyRestoredHeads(headers, entries);

  const final = headers.at(-1)!.body;

  if (final.listSeq !== finalState.seq || !p.equal(final.listHead, finalState.head))
    throw new EnvdenError("INVALID_DATA", "Uncommitted device list entries");

  return { entries, headers, state: finalState, states };
}

interface IHistory {
  entries: p.ISigned<p.TEntry>[];
  headers: p.ISigned<p.IManifestHeader>[];
  state: IDeviceListState;
  states?: ReadonlyMap<bigint, IDeviceListState>;
}

export type THistory = IHistory;
```

## apps/cli/src/vault/history.ts :: storedState

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function storedState(
  entries: p.ISigned<p.TEntry>[],
  stored: IDeviceListState | undefined,
  states: Map<bigint, IDeviceListState>,
) {
  let state = stored;

  if (stored) states.set(stored.seq, stored);

  for (const entry of entries) {
    if (stored && entry.body.seq <= stored.seq) continue;
    const applied = applyEntry(state, entry);

    if (applied.kind !== "valid")
      throw new EnvdenError("INVALID_DATA", "Invalid stored device list");

    state = applied.state;
    states.set(state.seq, state);
  }

  return state;
}
```

## apps/cli/src/vault/history.ts :: verifyNewHeaders

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function verifyNewHeaders(
  headers: p.ISigned<p.IManifestHeader>[],
  firstHeader: number,
  states: ReadonlyMap<bigint, IDeviceListState>,
  vaultId: Uint8Array,
) {
  let previous: Uint8Array = firstHeader
    ? p.objectHash(p.ManifestHeaderCodec, headers[firstHeader - 1]!, "manifest")
    : new Uint8Array(32);

  let previousEpoch = headers[firstHeader - 1]?.body.epoch ?? 0;

  for (let index = firstHeader; index < headers.length; index++) {
    const signed = headers[index]!;
    const h = signed.body;
    const at = states.get(h.listSeq);
    if (!at) throw new EnvdenError("INVALID_DATA", "Invalid device list");
    const signer = at.devices.get(p.base32(h.signer));

    if (!validHeader(signed, signer, vaultId, BigInt(index + 1), previous, at, previousEpoch))
      throw new EnvdenError("INVALID_DATA", "Invalid manifest history");

    previous = p.objectHash(p.ManifestHeaderCodec, signed, "manifest");
    previousEpoch = h.epoch;
  }
}
```

## apps/cli/src/vault/history.ts :: verifyRestoredHeads

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function verifyRestoredHeads(
  headers: p.ISigned<p.IManifestHeader>[],
  entries: p.ISigned<p.TEntry>[],
) {
  const earlier = new Set<string>();
  let next = 0;

  for (const signed of headers) {
    for (; next < entries.length && entries[next]!.body.seq <= signed.body.listSeq; next++) {
      const e = entries[next]!.body;

      if (e.kind === 6 && !earlier.has(p.base32(e.payload.restoredHead)))
        throw new EnvdenError("INVALID_DATA", "Invalid repair history");
    }

    earlier.add(p.base32(p.objectHash(p.ManifestHeaderCodec, signed, "manifest")));
  }
}
```

## apps/cli/src/vault/history.ts :: validHeader

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function validHeader(
  signed: p.ISigned<p.IManifestHeader>,
  signer: IDeviceListState["devices"] extends ReadonlyMap<string, infer V> ? V | undefined : never,
  vaultId: Uint8Array,
  seq: bigint,
  previous: Uint8Array,
  at: IDeviceListState,
  previousEpoch: number,
) {
  const h = signed.body;

  return !(
    !signer ||
    !p.equal(h.vaultId, vaultId) ||
    h.seq !== seq ||
    !p.equal(h.prev, previous) ||
    !p.equal(h.listHead, at.head) ||
    h.epoch !== at.epoch ||
    h.epoch < previousEpoch ||
    !p.verifyObject(p.ManifestHeaderCodec, signed, signer.objPub, "manifest").ok
  );
}
```

## apps/cli/src/vault/history.ts :: anchoredState

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function anchoredState(entries: p.ISigned<p.TEntry>[], stored?: IDeviceListState) {
  if (!stored) return undefined;
  const anchor = entries.find((entry) => entry.body.seq === stored.seq);

  return anchor && p.equal(p.objectHash(p.EntryCodec, anchor, "entry"), stored.head)
    ? stored
    : undefined;
}
```

## apps/cli/src/vault/named.ts :: namedForList

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function namedForList(device: p.IDeviceRecord, history: THistory) {
  const taken = [...history.state.devices.values()].map((member) => member.name);

  return { ...device, name: uniqueDeviceName(device.name, taken) };
}
```

## apps/cli/src/vault/setup.ts :: lockedsetupVault

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
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
    await recordUnlockWindow(client, state);
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
```

## apps/cli/src/vault/setup.ts :: setupVault

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export function setupVault(...args: Parameters<typeof lockedsetupVault>) {
  return withStateLock(args[0].home, () => lockedsetupVault(...args));
}
```

## apps/cli/src/vault/setup.ts :: resumableCreation

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/vault/setup.ts :: resumeCreation

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
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
  await recordUnlockWindow(client, pending.state);
  await saveState(adapters.home, pending.state, adapters.now);
  if (kit) return { state: pending.state, kit };

  return lostKitReplacement(adapters, options);
}
```

## apps/cli/src/vault/setup.ts :: matchesPendingKey

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/vault/creation.ts :: createVaultSwap

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function createVaultSwap(
  material: TGenesis,
  identity: TDeviceIdentity,
  password: string,
  registrationRecord: string,
  now: number,
) {
  const secret = p.randomBytes(16);

  const envelope = await p.sealEnvelope(
    {
      vaultId: material.vaultId,
      recoveryEncSk: material.recoveryKeys.encSk,
      recoveryObjSk: material.recoveryKeys.objSk,
      checkpoint: new Uint8Array(32),
      sealedAt: BigInt(now),
    },
    password,
    secret,
  );

  const files: p.IFiles = { entries: [] };

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      vaultId: material.vaultId,
      seq: 1n,
      op: 0,
      prev: new Uint8Array(32),
      listSeq: 1n,
      listHead: p.objectHash(p.EntryCodec, material.epoch, "entry"),
      epoch: 1,
      keyringHash: p.H("keyring-blob", material.keyring),
      filesHash: p.H("files", p.encode(p.FilesCodec, files)),
      envelopeHash: p.H("envelope-blob", envelope),
      createdAt: BigInt(now),
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead: new Uint8Array(32),
    entries: [material.genesis, material.epoch],
    header,
    files,
    keyring: material.keyring,
    envelope,
    skPub: p.skPub(secret, material.vaultId),
    opaqueRecord: new Uint8Array(Buffer.from(registrationRecord, "base64url")),
    approver: undefined,
  };

  return {
    swap,
    kit: { secretKey: p.encodeSecretKey(secret), vaultId: p.base32(material.vaultId) },
  };
}
```

## apps/cli/src/vault/add.ts :: addDeviceSwap

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function addDeviceSwap(
  history: THistory,
  device: p.IDeviceRecord,
  signer: Uint8Array,
  objSk: Uint8Array,
  epochKey: Uint8Array,
  op: 2 | 3,
  now: number,
  headerSigner: { id: Uint8Array; sk: Uint8Array },
): Promise<p.ISwap> {
  const before = history.headers.at(-1)!;
  const state = history.state;
  const wrap = await p.sealWrap(epochKey, state.vaultId, state.epoch, device.id, device.encPub);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: state.vaultId,
      seq: state.seq + 1n,
      parent: state.head,
      kind: 1,
      payload: { device, wrap },
      signer,
    },
    objSk,
    "entry",
  );

  if (applyEntry(state, entry).kind !== "valid")
    throw new EnvdenError("CONFLICT", "Device name or keys cannot be added");

  const expectedHead = p.objectHash(p.ManifestHeaderCodec, before, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...before.body,
      seq: before.body.seq + 1n,
      prev: expectedHead,
      op,
      listSeq: state.seq + 1n,
      listHead: p.objectHash(p.EntryCodec, entry, "entry"),
      createdAt: BigInt(now),
      signer: headerSigner.id,
    },
    headerSigner.sk,
    "manifest",
  );

  return {
    expectedHead,
    entries: [entry],
    header,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };
}
```

## apps/cli/src/vault/join/validation.ts :: joinedHeader

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
function joinedHeader(history: THistory, id: Uint8Array, pin: Uint8Array, hash: Uint8Array) {
  const header = history.headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), hash),
  );

  if (!header || !p.equal(history.state.serverPin, pin) || !history.state.devices.has(p.base32(id)))
    throw new EnvdenError("INVALID_DATA", "Pairing membership verification failed");

  return header;
}
```

## apps/cli/src/vault/join/validation.ts :: joinMembership

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/vault/join/validation.ts :: requireLocalFloor

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function requireLocalFloor(history: THistory, checkpoint: string | undefined) {
  if (
    checkpoint &&
    !history.headers.some((item) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(checkpoint)),
    )
  )
    throw new EnvdenError("FORK", "Joined history does not descend from the local checkpoint");
}
```

## apps/cli/src/vault/join/validation.ts :: verifiedBlob

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/vault/join/validation.ts :: historyHasHeader

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function historyHasHeader(history: THistory, hash: Uint8Array) {
  return history.headers.some((header) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), hash),
  );
}
```

## apps/cli/src/vault/join/advance.ts :: advanceCheckpoint

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function advanceCheckpoint(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  state: ILocalState,
  history: THistory,
) {
  const material = await checkpointMaterial(adapters, state);

  const context = {
    adapters,
    client,
    identity,
    state,
    skippedRoots: new Set<string>(),
    ...material,
    vaultId: material.checkpoint.header.body.vaultId,
    options: { now: () => 0, fetcher: adapters.fetcher },
  };

  await acceptHead(context, history);
  await persistCheckpoint(context);

  return state;
}
```

## apps/cli/src/vault/join/accept.ts :: lockedacceptJoin

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
async function lockedacceptJoin(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  history: THistory,
  manifestHash: Uint8Array,
) {
  const { header, at } = joinMembership(history, identity.record.id, pin, manifestHash);

  const existing = await joinLocalState(adapters.home, p.base32(history.state.vaultId));

  const dropped = await droppedRejoin(adapters, history, existing?.checkpoint);

  if (existing?.checkpoint && !dropped) {
    await recordUnlockWindow(client, existing);

    return advanceCheckpoint(adapters, client, identity, existing, history);
  }

  const wrap = deviceWrap(history.entries, identity.record.id, header.body.listSeq);

  const commit = at.state.commits.get(header.body.epoch);
  if (!wrap || !commit) throw new EnvdenError("INVALID_DATA", "Missing device epoch wrap");

  const key = await p.openWrap(
    wrap,
    identity.keys.encSk,
    identity.record.encPub,
    history.state.vaultId,
    header.body.epoch,
    commit,
  );

  const box = await verifiedBlob(client, "keyrings", "keyring-blob", header.body.keyringHash);

  const ring = p.openKeyring(
    box,
    key,
    history.state.vaultId,
    header.body.epoch,
    at.state.commits,
    await knownIdKey(adapters, existing),
  );

  const files = await verifiedBlob(client, "files", "files", header.body.filesHash);

  p.decode(p.FilesCodec, files);
  const committed = at.state.devices.get(p.base32(identity.record.id))!;
  await adoptCommittedName(adapters.keychain, adapters.home, committed);

  const state = existing ?? emptyState(committed.name);
  state.deviceName = committed.name;
  state.verifiedState = at.state;
  state.vaultId = p.base32(history.state.vaultId);
  state.server = { address, pin: text(pin), protocol: 1 };
  state.checkpoint = text(manifestHash);

  state.headers = history.headers
    .filter((item) => item.body.seq <= header.body.seq)
    .map((item) => text(p.encode(p.signedCodec(p.ManifestHeaderCodec), item)));

  state.entries = history.entries
    .filter((item) => item.body.seq <= header.body.listSeq)
    .map((item) => text(p.encode(p.signedCodec(p.EntryCodec), item)));

  state.keyring = text(box);
  state.files = text(files);
  await recordUnlockWindow(client, state);
  await adapters.keychain.set(`envden/${adapters.home}/epoch/${header.body.epoch}`, key);
  await adapters.keychain.set(`envden/${adapters.home}/id-key`, ring.idKey);
  await saveState(adapters.home, state, adapters.now);

  return state;
}
```

## apps/cli/src/vault/join/accept.ts :: acceptJoin

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export function acceptJoin(...args: Parameters<typeof lockedacceptJoin>) {
  return withStateLock(args[0].home, () => lockedacceptJoin(...args));
}
```

## apps/cli/src/vault/join/accept.ts :: knownIdKey

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
async function knownIdKey(adapters: TAdapters, state: Awaited<ReturnType<typeof loadState>>) {
  if (!state) return undefined;

  return (await adapters.keychain.get(`envden/${adapters.home}/id-key`)) ?? undefined;
}
```

## apps/cli/src/vault/join/floor.ts :: droppedRejoin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function droppedRejoin(adapters: TAdapters, history: THistory, checkpoint?: string) {
  if (!checkpoint) return false;
  if (historyHasHeader(history, binary(checkpoint))) return false;
  const result = await checkRejoin(adapters, history);
  if (result?.kind === "dropped-by-repair") return true;
  requireLocalFloor(history, checkpoint);

  return false;
}
```

## apps/cli/src/vault/join/material.ts :: checkpointMaterial

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function checkpointMaterial(adapters: TAdapters, state: ILocalState) {
  if (!state.checkpoint || !state.files || !state.keyring || !state.vaultId)
    throw new EnvdenError("INVALID_DATA", "Missing checkpoint material");

  const vaultId = p.unbase32(state.vaultId);

  const headers = state.headers.map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const header = headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(state.checkpoint!)),
  );

  const entries = state.entries.map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  if (!header) throw new EnvdenError("INVALID_DATA", "Missing checkpoint header");

  const chain =
    state.verifiedState?.seq === header.body.listSeq
      ? { kind: "valid" as const, state: state.verifiedState }
      : verifyChain(entries.filter((item) => item.body.seq <= header.body.listSeq));

  const idKey = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  const key = await adapters.keychain.get(`envden/${adapters.home}/epoch/${header.body.epoch}`);

  if (chain.kind !== "valid" || !idKey || !key)
    throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const ring = p.openKeyring(
    binary(state.keyring),
    key,
    vaultId,
    header.body.epoch,
    chain.state.commits,
    idKey,
  );

  const keys = new Map(ring.older.map((item) => [item.epoch, item.key]));
  keys.set(header.body.epoch, key);

  return {
    headers,
    entries,
    keys,
    checkpoint: {
      header,
      files: p.decode(p.FilesCodec, binary(state.files)),
      state: chain.state,
      idKey,
    },
  };
}
```

## apps/cli/src/vault/join/local-state.ts :: joinLocalState

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export async function joinLocalState(home: string, vaultId: string) {
  const state = await loadState(home);
  if (!state?.vaultId) return undefined;
  if (state.vaultId === vaultId) return state;

  if (!state.creationPending)
    throw new EnvdenError("CONFLICT", "Device is already configured for another vault");

  return undefined;
}
```

## apps/cli/src/vault/initial/push.ts :: attemptPushInitialFiles

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
async function attemptPushInitialFiles(
  adapters: TAdapters,
  state: ILocalState,
  now: () => number,
): Promise<void> {
  if (!state.links.length) return;

  if (!state.server || !state.vaultId)
    throw new EnvdenError("NOT_FOUND", "Vault is not configured");

  const { identity, vaultId, client } = await vaultConnection(
    adapters,
    { ...state, server: state.server, vaultId: state.vaultId },
    now,
    adapters.fetcher,
  );

  const history = await readHistory(client, vaultId);
  const previous = history.headers.at(-1)!;

  if (previous.body.seq !== 1n) {
    await resumeInitialFiles(adapters, now);

    return;
  }

  const key = await adapters.keychain.get(`envden/${adapters.home}/epoch/1`);
  const idKey = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  if (!key || !idKey) throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const { files, bases } = await initialEntries(adapters, state, client, vaultId, key, idKey);

  if (!files.entries.length) return;
  files.entries.sort((a, b) => p.compare(a.fileId, b.fileId));
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, previous, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...previous.body,
      seq: 2n,
      prev: expectedHead,
      op: 1,
      filesHash: p.H("files", p.FilesCodec.write(files)),
      createdAt: BigInt(now()),
    },
    identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead,
    header,
    entries: [],
    files,
    keyring: undefined,
    envelope: undefined,
    opaqueRecord: undefined,
    skPub: undefined,
    approver: undefined,
  };

  await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  state.headers.push(text(p.signedCodec(p.ManifestHeaderCodec).write(header)));
  state.files = text(p.FilesCodec.write(files));
  state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, header, "manifest"));
  await saveState(adapters.home, state, adapters.now);

  await recordPushed(adapters.home, files, bases, adapters.now);
}
```

## apps/cli/src/vault/initial/push.ts :: pushInitialFiles

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export function pushInitialFiles(...args: Parameters<typeof attemptPushInitialFiles>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptPushInitialFiles(...args)));
}
```

## apps/cli/src/vault/initial/entries.ts :: initialEntries

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export async function initialEntries(
  adapters: TAdapters,
  state: ILocalState,
  client: TClient,
  vaultId: Uint8Array,
  key: Uint8Array,
  idKey: Uint8Array,
) {
  const files: p.IFiles = { entries: [] };
  const bases = new Map<string, Uint8Array>();

  for (const link of state.links) {
    if (link.localOnly) continue;
    const checkout = state.approved.find((item) => item.root === link.root);
    if (!checkout) throw new EnvdenError("UNAUTHORIZED", "Checkout approval required");
    const repoId = state.aliases[checkout.repoId] ?? checkout.repoId;
    const fileId = p.fileId(idKey, repoId, link.path);
    const content = new Uint8Array(await readFile(link.store));

    const notice = fileSizeNotice(link.path, content);

    if (notice) {
      console.error(notice);
      continue;
    }

    bases.set(
      basePath(adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
      content,
    );

    if (files.entries.some((item) => p.equal(item.fileId, fileId))) continue;
    const context = { vaultId, epoch: 1, fileId, version: 1n };
    const name = { repoId, path: link.path };
    const blob = p.sealFile({ ...name, content }, key, context);
    const blobHash = p.H("blob", blob);
    await client.request(`/v1/blobs/${text(blobHash)}`, "PUT", blob);

    files.entries.push({
      fileId,
      version: 1n,
      epoch: 1,
      state: 1,
      blobHash,
      name: p.sealFileName(name, key, context),
    });
  }

  return { files, bases };
}
```

## apps/cli/src/vault/initial/record.ts :: recordPushed

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export async function recordPushed(
  home: string,
  files: p.IFiles,
  bases: Map<string, Uint8Array>,
  now: () => number,
) {
  const applied = await appliedFiles(home);

  for (const entry of files.entries)
    applied[p.base32(entry.fileId)] = text(p.FileEntryCodec.write(entry));

  await saveAppliedFiles(home, applied, now);
  for (const [path, bytes] of bases) await writeBytes(path, bytes, now);
}
```

## apps/cli/src/vault/initial/resume.ts :: resumeInitialFiles

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export async function resumeInitialFiles(adapters: TAdapters, now: () => number) {
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher });
  await acceptHead(context);
  const bases = new Map<string, Uint8Array>();
  const { checkpoint, keys, state, vaultId, client, identity } = context;

  if (!isInitialPush(checkpoint.header, identity.record.id)) return;

  for (const entry of checkpoint.files.entries) {
    if (entry.state !== 1) return;
    const key = keys.get(entry.epoch)!;
    const c = { vaultId, fileId: entry.fileId, epoch: entry.epoch, version: entry.version };
    const name = p.openFileName(entry.name, key, checkpoint.idKey, c);

    const links = matchingLinks(state, name);

    if (!links.length) return;

    const blob = new Uint8Array(
      await (await client.request(`/v1/blobs/${text(entry.blobHash)}`)).arrayBuffer(),
    );

    const file = p.openFile(blob, key, checkpoint.idKey, c, entry.blobHash, name);

    if (!(await recordMatchingBases(adapters.home, links, file.content, bases))) return;
  }

  await persistCheckpoint(context);
  await recordPushed(adapters.home, checkpoint.files, bases, adapters.now);
}
```

## apps/cli/src/vault/initial/resume.ts :: matchingLinks

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
function matchingLinks(
  state: Awaited<ReturnType<typeof syncContext>>["state"],
  name: { path: string; repoId: string },
) {
  return state.links.filter(
    (link) =>
      !link.localOnly &&
      link.path === name.path &&
      state.approved.some(
        (checkout) =>
          checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId,
      ),
  );
}
```

## apps/cli/src/vault/initial/resume.ts :: isInitialPush

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
function isInitialPush(
  header: Awaited<ReturnType<typeof syncContext>>["checkpoint"]["header"],
  deviceId: Uint8Array,
) {
  return header.body.seq === 2n && header.body.op === 1 && p.equal(header.body.signer, deviceId);
}
```

## apps/cli/src/vault/initial/resume.ts :: recordMatchingBases

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
async function recordMatchingBases(
  home: string,
  links: Awaited<ReturnType<typeof syncContext>>["state"]["links"],
  content: Uint8Array,
  bases: Map<string, Uint8Array>,
) {
  for (const link of links) {
    const local = await readBytes(link.mode === "copy" ? join(link.root, link.path) : link.store);
    if (!same(local, content)) return false;
    bases.set(basePath(home, link.store, link.mode === "copy" ? link.root : undefined), content);
  }

  return true;
}
```

## apps/cli/src/vault/recovery/read.ts :: readKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function readKit(path?: string, promptSecret = secret, promptInput = input) {
  if (path) return parseKit(await readKitFile(path));

  const secretKey = await promptSecret("Recovery secret key", secretKeyProblem);
  const vaultId = await promptInput("Vault ID", true, undefined, vaultIdProblem);

  return { secretKey: secretKey.trim(), vaultId: vaultId.trim() };
}
```

## apps/cli/src/vault/recovery/read.ts :: readKitFile

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function readKitFile(path: string) {
  return readFile(path, "utf8").catch((cause: unknown) => {
    throw new EnvdenError("INVALID_INPUT", "Can't read the recovery kit file", { cause });
  });
}
```

## apps/cli/src/vault/recovery/output.ts :: writeKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function writeKit(path: string, kit: unknown) {
  const file = await open(path, "wx", 0o600).catch((cause: unknown) => {
    throw new EnvdenError(
      "INVALID_INPUT",
      "Cannot create recovery kit; choose a new --kit-out path in an existing directory",
      { cause },
    );
  });

  try {
    await restrictAccess(path);
    await file.writeFile(JSON.stringify(kit, null, 2));
  } finally {
    await file.close();
  }
}
```

## apps/cli/src/vault/recovery/input.ts :: decodes

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function decodes(decode: () => Uint8Array, length: number) {
  try {
    return decode().length === length;
  } catch {
    return false;
  }
}
```

## apps/cli/src/vault/recovery/input.ts :: secretKeyProblem

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function secretKeyProblem(text: string) {
  return decodes(() => p.decodeSecretKey(text.trim()), 16)
    ? undefined
    : "Not a secret key. Copy the EK1-… line from your recovery kit";
}
```

## apps/cli/src/vault/recovery/input.ts :: vaultIdProblem

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function vaultIdProblem(text: string) {
  return decodes(() => p.unbase32(text.trim()), 32)
    ? undefined
    : "Not a vault ID. Copy it from your recovery kit";
}
```

## apps/cli/src/vault/recovery/input.ts :: parseKit

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function parseKit(text: string) {
  try {
    const kit = kitSchema.parse(JSON.parse(text));

    return { vaultId: kit.vaultId.trim(), secretKey: kit.secretKey.trim() };
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Not a recovery kit file", { cause });
  }
}
```

## apps/cli/src/vault/recovery/key.ts :: recoveryEpochKey

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function recoveryEpochKey(
  history: THistory,
  envelope: Awaited<ReturnType<typeof p.openEnvelope>>,
  recoveryKeys: { encSk: Uint8Array },
  vaultId: Uint8Array,
) {
  const recovery = history.state.recovery;

  if (
    !envelope.checkpoint.every((byte) => byte === 0) &&
    !history.headers.some((header) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), envelope.checkpoint),
    )
  )
    throw new EnvdenError("ROLLBACK", "Envelope checkpoint missing from history");

  const record = history.entries[0]!.body;
  if (record.kind !== 0) throw new EnvdenError("INVALID_DATA", "Missing genesis");
  let wrap: p.IWrap | undefined;

  for (const item of history.entries)
    if (item.body.kind === 2 || item.body.kind === 3 || item.body.kind === 4)
      wrap = item.body.payload.change.wraps.find((value) => p.equal(value.recipient, recovery.id));

  const commit = history.state.commits.get(history.state.epoch);
  if (!wrap || !commit) throw new EnvdenError("INVALID_DATA", "Missing recovery wrap");

  const epochKey = await p.openWrap(
    wrap,
    recoveryKeys.encSk,
    recovery.encPub,
    vaultId,
    history.state.epoch,
    commit,
  );

  return epochKey;
}
```

## apps/cli/src/vault/recovery/pending-kit.ts :: resumedKit

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function resumedKit(
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  options: { address: string; resumeSecretKey?: string },
) {
  if (!options.resumeSecretKey)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Resume setup with the recovery kit issued before creation",
    );

  const vaultId = state.vaultId!;
  const secret = p.decodeSecretKey(options.resumeSecretKey);

  if (state.creationPending) {
    const swap = p.decode(
      p.SwapCodec,
      new Uint8Array(Buffer.from(state.creationPending, "base64url")),
    );

    if (!swap.skPub || !p.equal(p.skPub(secret, p.unbase32(vaultId)), swap.skPub))
      throw new EnvdenError("INVALID_INPUT", "Recovery kit does not match pending vault");
  }

  return {
    vaultId,
    secretKey: options.resumeSecretKey,
    server: options.address,
    masterPassword: BLANK_PASSWORD,
  };
}

// The kit printed before creation is lost, so the committed vault gets a new one straight away.
```

## apps/cli/src/vault/recovery/pending-kit.ts :: lostKitReplacement

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function lostKitReplacement(
  adapters: TAdapters,
  options: {
    password: string;
    now: () => number;
    fetcher: TFetch;
    onKit?: (kit: ISetupKit) => Promise<void>;
  },
) {
  const result = await replaceKit(
    adapters,
    options.password,
    options.now,
    async (kit) => options.onKit?.({ ...kit, masterPassword: BLANK_PASSWORD }),
    options.fetcher,
  ).catch((cause: unknown) => {
    throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT, { cause });
  });

  if (result.kind !== "replaced") throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT);

  return {
    state: (await loadState(adapters.home))!,
    kit: { ...result.kit, masterPassword: BLANK_PASSWORD },
  };
}
```

## apps/cli/src/vault/recovery/resume.ts :: resumeKitJoin

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function resumeKitJoin(
  adapters: TAdapters,
  options: IKitJoin,
  context: Awaited<ReturnType<typeof prepareKitJoin>>,
) {
  const { resuming, history, identity, client, server, pending } = context;
  if (!resuming || !history.state.devices.has(p.base32(identity.record.id))) return;

  {
    const own = history.headers.find(
      (h) => h.body.op === 3 && p.equal(h.body.signer, identity.record.id),
    );

    if (!own) throw new EnvdenError("INVALID_DATA", "Missing kit join checkpoint");
    if (options.rejoin) await adoptRejoin(adapters, history);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      history,
      p.objectHash(p.ManifestHeaderCodec, own, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);
    await rm(pending, { force: true });

    return accepted;
  }
}
```

## apps/cli/src/vault/recovery/kit.ts :: attemptKitJoin

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
async function attemptKitJoin(adapters: TAdapters, options: IKitJoin) {
  const context = await prepareKitJoin(adapters, options);
  const resumed = await resumeKitJoin(adapters, options, context);
  if (resumed) return resumed;
  const { vaultId, server, pending, identity, client, history } = context;
  const secret = p.decodeSecretKey(options.secretKey);

  const head = history.headers.at(-1)!;
  const box = new Uint8Array(await (await client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const envelope = await p
    .openEnvelope(box, options.password, secret, vaultId)
    .catch((cause: unknown) => {
      if (cause instanceof EnvdenError) throw cause;

      throw new EnvdenError("INVALID_DATA", "Invalid recovery envelope", { cause });
    });

  secret.fill(0);
  const recoveryKeys = { encSk: envelope.recoveryEncSk, objSk: envelope.recoveryObjSk };

  try {
    const recovery = history.state.recovery;
    const epochKey = await recoveryEpochKey(history, envelope, recoveryKeys, vaultId);

    const swap = await addDeviceSwap(
      history,
      namedForList(identity.record, history),
      recovery.id,
      recoveryKeys.objSk,
      epochKey,
      3,
      options.now(),
      { id: identity.record.id, sk: identity.keys.objSk },
    );

    if (!p.verifyObject(p.EntryCodec, swap.entries[0]!, recovery.objPub, "entry").ok)
      throw new EnvdenError("INVALID_DATA", "Recovery key is no longer current");

    await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
    const updated = await readHistory(client, vaultId);

    if (options.rejoin) await adoptRejoin(adapters, updated);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      updated,
      p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);

    await rm(pending, { force: true });

    return accepted;
  } finally {
    recoveryKeys.encSk.fill(0);
    recoveryKeys.objSk.fill(0);
  }
}
```

## apps/cli/src/vault/recovery/kit.ts :: lockedkitJoin

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
function lockedkitJoin(...args: Parameters<typeof attemptKitJoin>) {
  return retryHead(() => attemptKitJoin(...args));
}
```

## apps/cli/src/vault/recovery/kit.ts :: kitJoin

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export function kitJoin(...args: Parameters<typeof lockedkitJoin>) {
  return withStateLock(args[0].home, () => lockedkitJoin(...args));
}
```

## apps/cli/src/vault/recovery/attempt.ts :: prepareKitJoin

DONE comparison: Rust implementation is in onboarding, owned by the other fixer. Ordered TS body and callbacks below were traced; known gaps are recorded in observations.md for that owner.

Ordered steps, including branches:

```ts
export async function prepareKitJoin(adapters: TAdapters, options: IKitJoin) {
  await joinLocalState(adapters.home, options.vaultId);
  const vaultId = p.unbase32(options.vaultId);
  const server = await hello(options.address, undefined, options.fetcher, MIN_SERVER);

  const pending = join(adapters.home, "state", "kit-join");

  const attempt = JSON.stringify({
    vaultId: options.vaultId,
    pin: p.base32(server.pin),
    name: options.name,
  });

  const resuming = (await optionalRead(pending)) === attempt;

  const identity = options.rejoin
    ? await rejoinIdentity(adapters, options.name)
    : await deviceIdentity(
        adapters.keychain,
        adapters.home,
        options.name,
        !resuming && !(await loadState(adapters.home))?.checkpoint,
      );

  await atomicWrite(pending, attempt, adapters.now);

  const client = createClient({
    address: options.address,
    pin: server.pin,
    vaultId,
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
  });

  if (resuming) {
    try {
      await login(client, vaultId, options.password);
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "NOT_MEMBER") throw error;
      await login(client, vaultId, options.password, "kit");
    }
  } else await login(client, vaultId, options.password, "kit");

  const history = await readHistory(client, vaultId);

  if (!p.equal(history.state.serverPin, server.pin))
    throw new EnvdenError("MOVING", "Vault moved; use its current server address");

  if (options.rejoin) await checkRejoin(adapters, history);

  return { vaultId, server, pending, resuming, identity, client, history };
}
```

## apps/cli/src/vault/files/retained.ts :: retainedList

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function retainedList(client: TClient, filesHash: Uint8Array) {
  const bytes = await optionalObject(client, `/v1/files/${text(filesHash)}`);
  if (!bytes) return undefined;

  if (!p.equal(p.H("files", bytes), filesHash))
    throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

  return p.decode(p.FilesCodec, bytes);
}
```

## apps/cli/src/vault/files/retained.ts :: retainedBlob

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function retainedBlob(client: TClient, blobHash: Uint8Array) {
  return optionalObject(client, `/v1/blobs/${text(blobHash)}`);
}
```

## apps/cli/src/vault/files/retained.ts :: openedName

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function openedName(
  entry: p.IFileEntry,
  keys: ReadonlyMap<number, Uint8Array>,
  idKey: Uint8Array,
  vaultId: Uint8Array,
) {
  const key = keys.get(entry.epoch);
  if (!key) return undefined;

  try {
    return p.openFileName(entry.name, key, idKey, { ...entry, vaultId });
  } catch {
    return undefined;
  }
}
```

## apps/cli/src/vault/keys/wrap.ts :: deviceWrap

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function deviceWrap(
  entries: p.ISigned<p.TEntry>[],
  recipient: Uint8Array,
  through?: bigint,
) {
  let wrap: p.IWrap | undefined;

  for (const { body: entry } of entries) {
    if (through !== undefined && entry.seq > through) break;
    if (entry.kind === 1 && p.equal(entry.payload.device.id, recipient)) wrap = entry.payload.wrap;

    if (entry.kind === 2 || entry.kind === 3 || entry.kind === 4)
      wrap = entry.payload.change.wraps.find((item) => p.equal(item.recipient, recipient));
  }

  return wrap;
}
```

## apps/cli/src/vault/recovery/pdf/report.ts :: reportKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function reportKit(kit: IReplacementKit, report: IKitReport) {
  const path = await saveKit(kit, report).catch(() => undefined);

  if (!path) {
    console.error("envden: Couldn't write the recovery kit file; save the kit printed below");
    printKit(kit);

    // keep the kit on screen until it's saved, instead of scrolling it away with the next questions
    while (process.stdin.isTTY && !(await consent("Saved the recovery kit?", false)));

    return;
  }

  printKitSaved(homePath(path, report.userHome), "pdf");

  if (process.stdin.isTTY && (await consent("Open it now?", true)) && !(await openBrowser(path)))
    console.error("envden: Couldn't open the kit; open the file above yourself");
}
```

## apps/cli/src/vault/recovery/pdf/report.ts :: saveKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function saveKit(kit: IReplacementKit, report: IKitReport) {
  const bytes = await renderKit(kitDocument(kit, new Date(report.now), report.deviceName));

  return writeKitPdf(await kitFolder(report.userHome), kit.vaultId, bytes);
}
```

## apps/cli/src/vault/recovery/pdf/name.ts :: kitFileName

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export function kitFileName(vaultId: string, copy: number): string {
  const base = `envden Recovery Kit ${vaultId.slice(0, 6)}`;

  return copy === 1 ? `${base}.pdf` : `${base} (${copy}).pdf`;
}
```

## apps/cli/src/vault/recovery/pdf/model.ts :: kitDocument

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function kitDocument(kit: IReplacementKit, date: Date, deviceName: string): IKitDocument {
  return {
    title: "envden Recovery Kit",
    details: [
      { label: "Created", value: localTime(date.getTime()) },
      { label: "Device", value: deviceName },
    ],
    fields: [
      { label: "Vault ID", value: kit.vaultId },
      { label: "Secret key", value: kit.secretKey, large: true },
      { label: "Server", value: kit.server },
    ],
    instructions: [
      `To get back in on a new device: run envden join ${kit.server} --recovery, enter the vault ID and secret key above, then your master password.`,
      "Keep this offline, like a passport. Never write your master password on it.",
      "Anyone with this kit and your master password can open the vault.",
    ],
    footer: SITE_URL,
  };
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: renderKit

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function renderKit(document: IKitDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);

  const page = pdf.addPage(PageSizes.A4);

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    code: await pdf.embedFont(StandardFonts.Courier),
  };

  const pen = { page, fonts };
  let y = page.getHeight() - MARGIN;

  y = drawHeader(pen, document, y);
  y = drawFields(pen, document, y - 28);
  drawInstructions(pen, document, y - 28);
  drawFooter(pen, document);

  // Without object streams older PDF readers can open the file too.
  return pdf.save({ useObjectStreams: false });
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawHeader

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function drawHeader({ page, fonts }: IPen, document: IKitDocument, top: number) {
  let y = top - 24;
  write(page, document.title, MARGIN, y, fonts.bold, 24);

  y -= 10;

  for (const detail of document.details) {
    y -= 15;
    write(page, detail.label, MARGIN, y, fonts.bold, 10, MUTED);
    write(page, detail.value, MARGIN + 56, y, fonts.regular, 10);
  }

  return y;
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawFields

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function drawFields({ page, fonts }: IPen, document: IKitDocument, top: number) {
  const width = page.getWidth() - MARGIN * 2;
  const inner = width - PADDING * 2;

  const rows = document.fields.map((field) => ({
    ...field,
    size: fitSize(field.value, fonts.code, field.large ? 18 : 12, inner),
  }));

  const height = PADDING * 2 + rows.reduce((sum, row) => sum + 9 + 8 + row.size, 0) + 18 * 2;

  page.drawRectangle({
    x: MARGIN,
    y: top - height,
    width,
    height,
    borderColor: RULE,
    borderWidth: 1,
  });

  let y = top - PADDING;

  for (const row of rows) {
    y -= 9;
    write(page, row.label.toUpperCase(), MARGIN + PADDING, y, fonts.bold, 9, MUTED);

    y -= 8 + row.size;
    write(page, row.value, MARGIN + PADDING, y, fonts.code, row.size);

    y -= 18;
  }

  return top - height;
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawInstructions

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function drawInstructions({ page, fonts }: IPen, document: IKitDocument, top: number) {
  const width = page.getWidth() - MARGIN * 2;
  let y = top;

  for (const paragraph of document.instructions) {
    const text = printable(paragraph, fonts.regular);
    const measure = (part: string) => fonts.regular.widthOfTextAtSize(part, 11);

    for (const line of breakTextIntoLines(text, [" "], width, measure)) {
      y -= 16;
      write(page, line.trim(), MARGIN, y, fonts.regular, 11);
    }

    y -= 8;
  }
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawFooter

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function drawFooter({ page, fonts }: IPen, document: IKitDocument) {
  const width = fonts.regular.widthOfTextAtSize(document.footer, 9);
  write(page, document.footer, (page.getWidth() - width) / 2, MARGIN, fonts.regular, 9, MUTED);
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: write

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function write(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  page.drawText(printable(text, font), { x, y, font, size, color });
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: fitSize

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function fitSize(text: string, font: PDFFont, preferred: number, width: number) {
  return Math.min(preferred, width / Math.max(font.widthOfTextAtSize(text, 1), 1));
}

// Standard fonts only cover WinAnsi; anything else (emoji, CJK, controls) would make pdf-lib throw.
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: printable

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function printable(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());

  return text.replace(/./gsu, (char) => (supported.has(char.codePointAt(0)!) ? char : "?"));
}
```

## apps/cli/src/vault/recovery/pdf/folder.ts :: kitFolder

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function kitFolder(userHome: string): Promise<string> {
  const downloads = join(userHome, "Downloads");
  const found = await stat(downloads).catch(() => undefined);

  return found?.isDirectory() ? downloads : userHome;
}
```

## apps/cli/src/vault/recovery/pdf/save.ts :: writeKitPdf

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
export async function writeKitPdf(
  folder: string,
  vaultId: string,
  bytes: Uint8Array,
): Promise<string> {
  for (let copy = 1; ; copy++) {
    const path = join(folder, kitFileName(vaultId, copy));
    const file = await open(path, "wx", 0o600).catch(skipExisting);
    if (!file) continue;

    try {
      await restrictAccess(path);
      await file.writeFile(bytes);
      await file.close();
    } catch (cause) {
      // A half-written kit is worse than none; the caller prints the kit instead.
      await file.close().catch(() => undefined);
      await rm(path, { force: true });

      throw cause;
    }

    return path;
  }
}
```

## apps/cli/src/vault/recovery/pdf/save.ts :: skipExisting

DONE comparison: traced ordered TS body and callbacks below through Rust vault/admin/notice helpers and their callers. Fix evidence and remaining limitations are recorded in observations.md.

Ordered steps, including branches:

```ts
function skipExisting(cause: unknown) {
  if ((cause as NodeJS.ErrnoException).code === "EEXIST") return undefined;

  throw cause;
}
```

## apps/cli/src/notice/offers.ts :: cacheOffers

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function cacheOffers(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string | undefined,
  update: { available: boolean; required: boolean },
  now = 0,
) {
  const path = join(adapters.home, "state", "track-offers");
  const roots = new Set(((await optionalRead(path)) ?? "").split("\n").filter(safeRoot));

  if (cwd) await scanOffer(adapters, state, cwd, roots, now);

  const pending = [...roots].filter((root) => !state.approved.some((item) => item.root === root));
  await atomicWrite(path, pending.join("\n") + (pending.length ? "\n" : ""), adapters.now);
  const lines = [];
  if (update.available) lines.push("envden: update available; run envden update");
  if (update.required) lines.push("envden: update required; run envden update");

  await atomicWrite(
    join(adapters.home, "state", "notice-update"),
    lines.join("\n") + (lines.length ? "\n" : ""),
    adapters.now,
  );
}
```

## apps/cli/src/notice/offers.ts :: safeRoot

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function safeRoot(root: string) {
  return !!root && sanitizeTerminal(root) === root && !/[\r\n]/.test(root);
}
```

## apps/cli/src/notice/offers.ts :: scanOffer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function scanOffer(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string,
  roots: Set<string>,
  now: number,
) {
  const checkout = await adapters.repo.checkoutAt(cwd).catch(() => undefined);
  if (!checkout || !safeRoot(checkout.root) || roots.has(checkout.root)) return;
  if (state.approved.some((item) => item.root === checkout.root)) return;
  const path = join(adapters.home, "state", "track-scanned.json");
  const scans = await recentScans(path, now);
  const previous = scans[checkout.root];
  if (previous !== undefined && now - previous < millisecondsInMinute) return;

  const files = await adapters.repo.envFiles(
    checkout,
    (await readConfig(adapters.home))["env-files"],
  );

  if (files.length) roots.add(checkout.root);
  scans[checkout.root] = now;
  await atomicWrite(path, JSON.stringify(scans), adapters.now);
}
```

## apps/cli/src/notice/offers.ts :: recentScans

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function recentScans(path: string, now: number): Promise<Record<string, number>> {
  const saved = scansSchema.safeParse(JSON.parse((await optionalRead(path)) ?? "{}")).data ?? {};

  const scans: Record<string, number> = Object.fromEntries(
    Object.entries(saved)
      .filter((entry) => now - entry[1] < millisecondsInMinute)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 255),
  );

  return scans;
}
```

## apps/cli/src/notice/pending.ts :: pendingJoins

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
async function pendingJoins(home: string): Promise<Record<string, string>> {
  const pending = await optionalRead(join(home, "state", "pending-recovery.json"));
  if (!pending) return {};

  try {
    const value: unknown = JSON.parse(pending);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    if (Object.values(value).some((name) => typeof name !== "string")) return {};

    return Object.fromEntries(Object.entries(value));
  } catch {
    return {};
  }
}
```

## apps/cli/src/notice/pending.ts :: addPendingJoins

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function addPendingJoins(
  home: string,
  entries: string[],
  ownId: Uint8Array,
  now: () => number,
) {
  const pending = await pendingJoins(home);

  const seen = new Set<string>(
    JSON.parse((await optionalRead(join(home, "state", "recovery-notice"))) ?? "[]"),
  );

  for (const [id, name] of Object.entries(recoveryJoins(entries, ownId))) {
    if (!seen.has(id)) pending[id] = name;
  }

  await atomicWrite(join(home, "state", "pending-recovery.json"), JSON.stringify(pending), now);
}
```

## apps/cli/src/notice/pending.ts :: reportPendingJoins

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function reportPendingJoins(home: string, now: () => number) {
  const pending = await pendingJoins(home);
  await printRecoveryJoins(home, pending, now);
  await atomicWrite(join(home, "state", "pending-recovery.json"), "{}", now);
}
```

## apps/cli/src/notice/cache.ts :: noticeStatus

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function noticeStatus(home: string, state: ILocalState) {
  const repos = new Set<string>();

  for (const link of state.links) {
    if (link.localOnly) continue;

    const base = await readBytes(
      basePath(home, link.store, link.mode === "copy" ? link.root : undefined),
    );

    const local = await readBytes(link.mode === "link" ? link.store : join(link.root, link.path));

    if (!same(base, local)) {
      const checkout = state.approved.find((item) => item.root === link.root);
      if (checkout) repos.add(state.aliases[checkout.repoId] ?? checkout.repoId);
    }
  }

  return [...repos].map((repoId) => ({ repoId, status: "local changes" }));
}
```

## apps/cli/src/notice/cache.ts :: lockedrefreshNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedrefreshNotice(
  home: string,
  state: ILocalState,
  caseInsensitive: (root: string) => Promise<boolean>,
  now: () => number,
): Promise<void> {
  const roots = state.approved
    .map((item) => item.root)
    .filter((root) => sanitizeTerminal(root) === root && !/[\r\n]/.test(root));

  await atomicWrite(join(home, "state", "approved-checkouts"), roots.join("\n") + "\n", now);

  const insensitive = await Promise.all(
    roots.map(async (root) =>
      (await caseInsensitive(root).catch(() => false)) ? root : undefined,
    ),
  );

  await atomicWrite(
    join(home, "state", "approved-checkouts-insensitive"),
    insensitive.filter((root) => root !== undefined).join("\n") + "\n",
    now,
  );

  const local = await noticeStatus(home, state);
  const remote = await readRemoteNotice(home);
  const repos = [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])];

  await atomicWrite(
    join(home, "state", "notice"),
    repos.map((repoId) => `envden: ${sanitizeTerminal(repoId)} out of sync`).join("\n") +
      (repos.length ? "\n" : ""),
    now,
  );
}
```

## apps/cli/src/notice/cache.ts :: cachedNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function cachedNotice(home: string): Promise<string> {
  return ((await optionalRead(join(home, "state", "notice"))) ?? "")
    .split("\n")
    .map(sanitizeTerminal)
    .join("\n");
}
```

## apps/cli/src/notice/cache.ts :: refreshNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function refreshNotice(...args: Parameters<typeof lockedrefreshNotice>) {
  return withStateLock(args[0], () => lockedrefreshNotice(...args));
}
```

## apps/cli/src/notice/remote.ts :: remoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function remoteNotice(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  await acceptHead(context, undefined, true);
  const result = await pendingRepos(context);

  await withStateLock(adapters.home, async () => {
    await writeRemoteNotice(
      adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      adapters.now,
    );

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
      adapters.now,
    );
  });

  return result;
}
```

## apps/cli/src/notice/remote.ts :: settleRemoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function settleRemoteNotice(context: TSyncContext) {
  const result = await pendingRepos(context);

  await withStateLock(context.adapters.home, () =>
    writeRemoteNotice(
      context.adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      context.options.now,
    ),
  );
}
```

## apps/cli/src/notice/remote.ts :: pendingRepos

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function pendingRepos(context: TSyncContext) {
  const applied = await appliedFiles(context.adapters.home);
  const rules = (await readConfig(context.adapters.home))["env-files"];

  const approved = new Set(
    context.state.approved.map((item) => context.state.aliases[item.repoId] ?? item.repoId),
  );

  const files: { repoId: string; path: string }[] = [];

  for (const entry of readableEntries(context)) {
    if (applied[p.base32(entry.fileId)] === text(p.FileEntryCodec.write(entry))) continue;
    const name = entryName(context, entry);

    if (
      approved.has(name.repoId) &&
      acceptsEnvPath(name.path, rules) &&
      receivesFile(context.state, name)
    )
      files.push({ repoId: name.repoId, path: name.path });
  }

  const repos = [...new Set(files.map((file) => file.repoId))];

  return { checkedAt: context.options.now(), repos, files };
}
```

## apps/cli/src/notice/remote.ts :: writeRemoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function writeRemoteNotice(home: string, notice: TRemoteNotice, now: () => number) {
  return atomicWrite(join(home, "state", "remote-notice.json"), JSON.stringify(notice), now);
}
```

## apps/cli/src/notice/remote.ts :: readRemoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function readRemoteNotice(home: string): Promise<TRemoteNotice | undefined> {
  const value = await optionalRead(join(home, "state", "remote-notice.json"));

  try {
    return remoteNoticeSchema.safeParse(value ? JSON.parse(value) : undefined).data;
  } catch {
    return undefined;
  }
}
```

## apps/cli/src/notice/recovery.ts :: recoveryJoins

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export function recoveryJoins(values: string[], ownId?: Uint8Array) {
  const signed = values.map((value) => p.decode(p.signedCodec(p.EntryCodec), binary(value)));
  const entries = signed.map((entry) => entry.body);
  const names = currentNames(entries);
  const notices: Record<string, string> = {};

  const ownJoin =
    entries.find(
      (entry) =>
        (entry.kind === 0 || entry.kind === 1) &&
        ownId !== undefined &&
        p.equal(entry.payload.device.id, ownId),
    )?.seq ?? -1n;

  let recovery: Uint8Array | undefined;

  for (const event of signed) {
    const entry = event.body;

    if (entry.kind === 1 && recovery && p.equal(entry.signer, recovery) && entry.seq > ownJoin)
      notices[text(p.objectHash(p.EntryCodec, event, "entry"))] = names.get(
        p.base32(entry.payload.device.id),
      )!;

    recovery = nextRecovery(recovery, entry);
  }

  return notices;
}
```

## apps/cli/src/notice/recovery.ts :: currentNames

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function currentNames(entries: p.TEntry[]) {
  const names = new Map<string, string>();

  for (const entry of entries) {
    if (entry.kind === 0 || entry.kind === 1)
      names.set(p.base32(entry.payload.device.id), entry.payload.device.name);
    else if (entry.kind === 7) names.set(p.base32(entry.payload.device), entry.payload.name);
  }

  return names;
}
```

## apps/cli/src/notice/recovery.ts :: nextRecovery

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
function nextRecovery(current: Uint8Array | undefined, entry: p.TEntry) {
  if (entry.kind === 0 || entry.kind === 4) return entry.payload.recovery.id;
  if (entry.kind === 2 && entry.payload.newRecovery) return entry.payload.newRecovery.id;

  return current;
}
```

## apps/cli/src/notice/recovery.ts :: printRecoveryJoins

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function printRecoveryJoins(
  home: string,
  notices: Record<string, string>,
  now: () => number,
) {
  const path = join(home, "state", "recovery-notice");
  const seen = new Set<string>(JSON.parse((await optionalRead(path)) ?? "[]"));

  for (const [id, name] of Object.entries(notices)) {
    if (seen.has(id)) continue;
    console.error(`envden: ${sanitizeTerminal(name)} joined with the recovery kit`);
    seen.add(id);
  }

  await atomicWrite(path, JSON.stringify([...seen]), now);
}
```

## apps/cli/src/notice/recovery.ts :: reportRecoveryJoins

DONE: compared the ordered source body below, including its callbacks, against the corresponding Rust helper and callers.

Ordered steps, including branches:

```ts
export async function reportRecoveryJoins(
  home: string,
  state: ILocalState,
  ownId: Uint8Array | undefined,
  now: () => number,
) {
  await printRecoveryJoins(home, recoveryJoins(state.entries, ownId), now);
}
```

## apps/cli/src/notice/command.ts :: lockedcommandNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedcommandNotice(
  adapters: TAdapters,
  now: number,
  refresh = false,
  cwd?: string,
) {
  await cleanupOldBinary(process.execPath, process.platform === "win32");
  const state = await loadState(adapters.home);
  if (!state) return { repos: [], update: await updateStatus(adapters.home) };

  if (!refresh) await reportPendingJoins(adapters.home, adapters.now);
  const remote = await readRemoteNotice(adapters.home);

  await refreshNotice(
    adapters.home,
    state,
    (root) => adapters.repo.caseInsensitive(root, true),
    adapters.now,
  );

  const update = await updateStatus(adapters.home);
  await cacheOffers(adapters, state, cwd, update, now);
  const local = await noticeStatus(adapters.home, state);

  const currentRepo = currentRepoId(state, cwd);

  return {
    repos: [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])]
      .filter((repo) => repo !== currentRepo)
      .map(sanitizeTerminal),
    update,
  };
}
```

## apps/cli/src/notice/command.ts :: commandNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function commandNotice(
  adapters: TAdapters,
  now: number,
  fetcher: TFetch,
  refresh = false,
  cwd?: string,
  localOnly = false,
) {
  const fetchNotice = boundedFetch(fetcher);

  try {
    if (!refresh) {
      await withStateLock(adapters.home, () => reportPendingJoins(adapters.home, adapters.now));
    }

    if (!localOnly) {
      const state = await loadState(adapters.home);
      if (state) await refreshedRemote(adapters, state, now, fetchNotice, !refresh);
    }

    if (!refresh && !localOnly) await runUpdateCheck(adapters, now, false, fetcher);

    return await withStateLock(adapters.home, () =>
      lockedcommandNotice(adapters, now, refresh, cwd),
    );
  } catch {
    return { repos: [], update: { available: false, required: false } };
  }
}
```

## apps/cli/src/notice/command.ts :: refreshedRemote

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function refreshedRemote(
  adapters: TAdapters,
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  now: number,
  fetcher: TFetch,
  force: boolean,
) {
  let remote = await readRemoteNotice(adapters.home);

  if (state.checkpoint && (force || !remote || now - remote.checkedAt >= millisecondsInMinute)) {
    try {
      remote = await remoteNotice(adapters, { now: () => now, fetcher, all: true });
    } catch {
      remote = undefined;
    }
  }

  return remote;
}
```

## apps/cli/src/notice/command.ts :: currentRepoId

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function currentRepoId(state: NonNullable<Awaited<ReturnType<typeof loadState>>>, cwd?: string) {
  const current = cwd
    ? state.approved.find(
        (item) => resolve(cwd) === item.root || resolve(cwd).startsWith(item.root + sep),
      )
    : undefined;

  const currentRepo = current && (state.aliases[current.repoId] ?? current.repoId);

  return currentRepo;
}
```

## apps/cli/src/notice/fetch.ts :: boundedFetch

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function boundedFetch(
  fetcher: TFetch,
  deadline = AbortSignal.timeout(milliseconds({ seconds: 2 })),
): TFetch {
  return async (input, init) => {
    const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    signal.throwIfAborted();
    let abort = () => {};

    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });

    try {
      return await Promise.race([fetcher(input, { ...init, signal }), cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
}
```

# Anonymous callback inventory

## apps/cli/src/vault/genesis.ts :: callback@37

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.sealWrap(epochKey, vaultId, 1, member.id, member.encPub)
```

## apps/cli/src/vault/genesis.ts :: callback@42

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.compare(a.recipient, b.recipient)
```

## apps/cli/src/vault/history.ts :: callback@36

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(value))
```

## apps/cli/src/vault/history.ts :: callback@40

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value))
```

## apps/cli/src/vault/history.ts :: callback@195

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.seq === stored.seq
```

## apps/cli/src/vault/named.ts :: callback@6

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
member.name
```

## apps/cli/src/vault/join/validation.ts :: callback@9

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), hash)
```

## apps/cli/src/vault/join/validation.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.listSeq
```

## apps/cli/src/vault/join/validation.ts :: callback@41

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(checkpoint))
```

## apps/cli/src/vault/join/validation.ts :: callback@65

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), hash)
```

## apps/cli/src/vault/join/advance.ts :: callback@27

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
0
```

## apps/cli/src/vault/join/accept.ts :: callback@80

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.seq
```

## apps/cli/src/vault/join/accept.ts :: callback@81

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.encode(p.signedCodec(p.ManifestHeaderCodec), item))
```

## apps/cli/src/vault/join/accept.ts :: callback@84

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.listSeq
```

## apps/cli/src/vault/join/accept.ts :: callback@85

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.encode(p.signedCodec(p.EntryCodec), item))
```

## apps/cli/src/vault/join/accept.ts :: callback@98

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedacceptJoin(...args)
```

## apps/cli/src/vault/join/material.ts :: callback@14

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value))
```

## apps/cli/src/vault/join/material.ts :: callback@18

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(state.checkpoint!))
```

## apps/cli/src/vault/join/material.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(value))
```

## apps/cli/src/vault/join/material.ts :: callback@31

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.listSeq
```

## apps/cli/src/vault/join/material.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[item.epoch, item.key]
```

## apps/cli/src/vault/initial/push.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.compare(a.fileId, b.fileId)
```

## apps/cli/src/vault/initial/push.ts :: callback@87

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptPushInitialFiles(...args))
```

## apps/cli/src/vault/initial/push.ts :: callback@87

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptPushInitialFiles(...args)
```

## apps/cli/src/vault/initial/entries.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === link.root
```

## apps/cli/src/vault/initial/entries.ts :: callback@43

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(item.fileId, fileId)
```

## apps/cli/src/vault/initial/resume.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!link.localOnly &&
      link.path === name.path &&
      state.approved.some(
        (checkout) =>
          checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId,
      )
```

## apps/cli/src/vault/initial/resume.ts :: callback@52

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId
```

## apps/cli/src/vault/recovery/read.ts :: callback@16

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    throw new EnvdenError("INVALID_INPUT", "Can't read the recovery kit file", { cause });
  }
```

## apps/cli/src/vault/recovery/output.ts :: callback@6

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    throw new EnvdenError(
      "INVALID_INPUT",
      "Cannot create recovery kit; choose a new --kit-out path in an existing directory",
      { cause },
    );
  }
```

## apps/cli/src/vault/recovery/input.ts :: callback@6

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!vaultIdProblem(value)
```

## apps/cli/src/vault/recovery/input.ts :: callback@7

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!secretKeyProblem(value)
```

## apps/cli/src/vault/recovery/input.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decodeSecretKey(text.trim())
```

## apps/cli/src/vault/recovery/input.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.unbase32(text.trim())
```

## apps/cli/src/vault/recovery/pdf/report.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@73

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({
    ...field,
    size: fitSize(field.value, fonts.code, field.large ? 18 : 12, inner),
  })
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@78

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
sum + 9 + 8 + row.size
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@110

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
fonts.regular.widthOfTextAtSize(part, 11)
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@146

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
(supported.has(char.codePointAt(0)!) ? char : "?")
```

## apps/cli/src/vault/recovery/pdf/folder.ts :: callback@7

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/vault/recovery/pdf/save.ts :: callback@23

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/vault/recovery/key.ts :: callback@15

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
byte === 0
```

## apps/cli/src/vault/recovery/key.ts :: callback@16

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), envelope.checkpoint)
```

## apps/cli/src/vault/recovery/key.ts :: callback@28

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(value.recipient, recovery.id)
```

## apps/cli/src/vault/recovery/pending-kit.ts :: callback@64

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
options.onKit?.({ ...kit, masterPassword: BLANK_PASSWORD })
```

## apps/cli/src/vault/recovery/pending-kit.ts :: callback@66

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT, { cause });
  }
```

## apps/cli/src/vault/recovery/resume.ts :: callback@23

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body.op === 3 && p.equal(h.body.signer, identity.record.id)
```

## apps/cli/src/vault/recovery/kit.ts :: callback@35

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      if (cause instanceof EnvdenError) throw cause;

      throw new EnvdenError("INVALID_DATA", "Invalid recovery envelope", { cause });
    }
```

## apps/cli/src/vault/recovery/kit.ts :: callback@89

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptKitJoin(...args)
```

## apps/cli/src/vault/recovery/kit.ts :: callback@93

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedkitJoin(...args)
```

## apps/cli/src/vault/setup.ts :: callback@60

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.encode(p.signedCodec(p.EntryCodec), entry))
```

## apps/cli/src/vault/setup.ts :: callback@74

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("setup", p.tokenKey("setup", token.secret), request)
```

## apps/cli/src/vault/setup.ts :: callback@116

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedsetupVault(...args)
```

## apps/cli/src/vault/setup.ts :: callback@162

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("setup", p.tokenKey("setup", token.secret), request)
```

## apps/cli/src/vault/setup.ts :: callback@192

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 3
```

## apps/cli/src/vault/keys/wrap.ts :: callback@15

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(item.recipient, recipient)
```

## apps/cli/src/admin/move/switch.ts :: callback@36

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 5
```

## apps/cli/src/admin/move/switch.ts :: callback@51

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedswitchServer(...args)
```

## apps/cli/src/admin/move/abort.ts :: callback@58

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedabortMove(...args)
```

## apps/cli/src/admin/move/follow.ts :: callback@21

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 5
```

## apps/cli/src/admin/move/follow.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(h.body.listHead, p.objectHash(p.EntryCodec, moved, "entry"))
```

## apps/cli/src/admin/move/follow.ts :: callback@64

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.signedCodec(p.ManifestHeaderCodec).write(h))
```

## apps/cli/src/admin/move/resume.ts :: callback@11

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 5
```

## apps/cli/src/admin/move/run.ts :: callback@66

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("setup", p.tokenKey("setup", token.secret), request)
```

## apps/cli/src/admin/move/run.ts :: callback@91

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedmoveServer(...args)
```

## apps/cli/src/admin/rejoin/classify.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(h))
```

## apps/cli/src/admin/rejoin/classify.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(e))
```

## apps/cli/src/admin/recovery/reset.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.signSKProof(secret, request.vaultId, request)
```

## apps/cli/src/admin/recovery/reset.ts :: callback@68

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptResetPassword(...args))
```

## apps/cli/src/admin/recovery/reset.ts :: callback@68

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptResetPassword(...args)
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@139

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    const keys = p.generateRecoveryKeys();
    const secret = p.randomBytes(16);
    let shown = false;

    const show = async (kit: IReplacementKit) => {
      if (shown) return;
      await onKit(kit);
      shown = true;
    };

    try {
      return await retryHead(() =>
        attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed),
      );
    } finally {
      keys.encSk.fill(0);
      keys.objSk.fill(0);
      secret.fill(0);
    }
  }
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@144

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      if (shown) return;
      await onKit(kit);
      shown = true;
    }
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@151

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed)
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@163

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptChangePassword(...args))
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@163

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptChangePassword(...args)
```

## apps/cli/src/admin/shared/history.ts :: callback@10

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[header.body.seq, header]
```

## apps/cli/src/admin/shared/epoch.ts :: callback@17

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!removed || !p.equal(device.id, removed)
```

## apps/cli/src/admin/shared/epoch.ts :: callback@21

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.sealWrap(nextKey, context.vaultId, epoch, member.id, member.encPub)
```

## apps/cli/src/admin/shared/epoch.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.compare(a.recipient, b.recipient)
```

## apps/cli/src/admin/shared/transfer.ts :: callback@39

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
e.body.seq > listSeq && e.body.seq <= header.body.listSeq
```

## apps/cli/src/admin/shared/transfer.ts :: callback@69

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
optionalObject(source, `/v1/files/${text(hash)}`)
```

## apps/cli/src/admin/shared/material.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[item.epoch, item.key] as const
```

## apps/cli/src/admin/repair/finish.ts :: callback@52

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
d.name
```

## apps/cli/src/admin/repair/finish.ts :: callback@78

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptFinishRepair(...args))
```

## apps/cli/src/admin/repair/finish.ts :: callback@78

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptFinishRepair(...args)
```

## apps/cli/src/admin/repair/drop.ts :: callback@13

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
d.name === name || p.base32(d.id) === name
```

## apps/cli/src/admin/repair/completion/reports.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      const result = decodeServerObject({
        received: binary(r),
        codec: p.RepairReportCodec,
        label: "repair-report",
        mismatch: "fork",
        members: [...history.state.devices.values()],
        currentVersion: VERSION,
        latestVersion: context.local.latest ?? VERSION,
      });

      if (result.kind === "known") return [result.value];

      if (result.kind === "update-required")
        throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

      if (result.kind === "unreadable")
        throw new EnvdenError("INVALID_DATA", "Unreadable data from server");

      return [];
    }
```

## apps/cli/src/admin/repair/completion/reports.ts :: callback@43

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.base32(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))
```

## apps/cli/src/admin/repair/completion/names.ts :: callback@15

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[e.epoch, e.key] as const
```

## apps/cli/src/admin/repair/completion/names.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.openFileName(entry.name, keys.get(entry.epoch)!, ring.idKey, {
      vaultId: context.vaultId,
      epoch: entry.epoch,
      fileId: entry.fileId,
      version: entry.version,
    })
```

## apps/cli/src/admin/repair/completion/close.ts :: callback@21

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), binary(status.restoredHead))
```

## apps/cli/src/admin/repair/completion/close.ts :: callback@32

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
evidence === text(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))
```

## apps/cli/src/admin/repair/completion/close.ts :: callback@38

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body
```

## apps/cli/src/admin/repair/lost.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      const bytes = await optionalObject(
        context.client,
        `/v1/files/${text(header.body.filesHash)}`,
      );

      if (bytes && !p.equal(p.H("files", bytes), header.body.filesHash))
        throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

      return { header: header.body, files: bytes ? p.decode(p.FilesCodec, bytes) : undefined };
    }
```

## apps/cli/src/admin/repair/lost.ts :: callback@39

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(e.fileId)
```

## apps/cli/src/admin/repair/chain.ts :: callback@5

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), new Uint8Array(Buffer.from(value, "base64url")))
```

## apps/cli/src/admin/repair/upload.ts :: callback@35

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("repair", p.tokenKey("repair", token.secret), request)
```

## apps/cli/src/admin/repair/upload.ts :: callback@60

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value))
```

## apps/cli/src/admin/repair/upload.ts :: callback@83

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.signedCodec(p.ManifestHeaderCodec).write(h))
```

## apps/cli/src/admin/repair/upload.ts :: callback@98

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
        if (context.local.files && p.equal(p.H("files", binary(context.local.files)), hash))
          return binary(context.local.files);

        return cachedBytes(join(adapters.home, "state", "file-lists", text(hash)));
      }
```

## apps/cli/src/admin/repair/upload.ts :: callback@168

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockeduploadRepair(...args)
```

## apps/cli/src/admin/repair/resume.ts :: callback@71

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), close.payload.restoredHead)
```

## apps/cli/src/admin/repair/resume.ts :: callback@83

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body.seq < swap.header.body.seq
```

## apps/cli/src/admin/repair/resume.ts :: callback@84

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body
```

## apps/cli/src/admin/devices/rotate.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptRotateVault(...args))
```

## apps/cli/src/admin/devices/rotate.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptRotateVault(...args)
```

## apps/cli/src/admin/devices/recovery-holders.ts :: callback@20

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.kind === 0
          ? p.equal(item.body.payload.device.id, entry.signer)
          : item.body.kind === 1 && p.equal(item.body.payload.device.id, entry.signer)
```

## apps/cli/src/admin/devices/remove.ts :: callback@51

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptRemoveDevice(...args))
```

## apps/cli/src/admin/devices/remove.ts :: callback@51

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptRemoveDevice(...args)
```

## apps/cli/src/admin/devices/remove.ts :: callback@86

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.name === name || p.base32(item.id) === name
```

## apps/cli/src/admin/devices/exposure.ts :: callback@37

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({
      repoId: name.repoId,
      path: name.path,
      keys: [...name.keys].sort(),
    })
```

## apps/cli/src/admin/devices/rename.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
device.name === name
```

## apps/cli/src/admin/devices/rename.ts :: callback@65

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptRenameDevice(...args))
```

## apps/cli/src/admin/devices/rename.ts :: callback@65

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptRenameDevice(...args)
```

## apps/cli/src/admin/devices/list.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({
    id: p.base32(device.id),
    name: device.name,
    clientVersion: seen.find((item) => item.id === text(device.id))?.clientVersion ?? null,
    unconfirmed: !seen.find((item) => item.id === text(device.id))?.confirmed,
    recoveryKeyHeld: holders.has(p.base32(device.id)),
    current: p.equal(device.id, context.identity.record.id),
  })
```

## apps/cli/src/admin/devices/list.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.id === text(device.id)
```

## apps/cli/src/admin/devices/list.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.id === text(device.id)
```

## apps/cli/src/notice/offers.ts :: callback@24

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!state.approved.some((item) => item.root === root)
```

## apps/cli/src/notice/offers.ts :: callback@24

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === root
```

## apps/cli/src/notice/offers.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/notice/offers.ts :: callback@50

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === checkout.root
```

## apps/cli/src/notice/offers.ts :: callback@71

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
now - entry[1] < millisecondsInMinute
```

## apps/cli/src/notice/offers.ts :: callback@72

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
b[1] - a[1]
```

## apps/cli/src/notice/pending.ts :: callback@13

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
typeof name !== "string"
```

## apps/cli/src/notice/cache.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === link.root
```

## apps/cli/src/notice/cache.ts :: callback@27

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({ repoId, status: "local changes" })
```

## apps/cli/src/notice/cache.ts :: callback@37

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root
```

## apps/cli/src/notice/cache.ts :: callback@38

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
sanitizeTerminal(root) === root && !/[\r\n]/.test(root)
```

## apps/cli/src/notice/cache.ts :: callback@43

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
(await caseInsensitive(root).catch(() => false)) ? root : undefined
```

## apps/cli/src/notice/cache.ts :: callback@44

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
false
```

## apps/cli/src/notice/cache.ts :: callback@50

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
root !== undefined
```

## apps/cli/src/notice/cache.ts :: callback@56

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.repoId
```

## apps/cli/src/notice/cache.ts :: callback@60

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
`envden: ${sanitizeTerminal(repoId)} out of sync`
```

## apps/cli/src/notice/cache.ts :: callback@74

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedrefreshNotice(...args)
```

## apps/cli/src/notice/remote.ts :: callback@27

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    await writeRemoteNotice(
      adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      adapters.now,
    );

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
      adapters.now,
    );
  }
```

## apps/cli/src/notice/remote.ts :: callback@36

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.signedCodec(p.EntryCodec).write(entry))
```

## apps/cli/src/notice/remote.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
writeRemoteNotice(
      context.adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      context.options.now,
    )
```

## apps/cli/src/notice/remote.ts :: callback@62

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
context.state.aliases[item.repoId] ?? item.repoId
```

## apps/cli/src/notice/remote.ts :: callback@79

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
file.repoId
```

## apps/cli/src/notice/recovery.ts :: callback@9

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(value))
```

## apps/cli/src/notice/recovery.ts :: callback@10

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body
```

## apps/cli/src/notice/recovery.ts :: callback@16

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
(entry.kind === 0 || entry.kind === 1) &&
        ownId !== undefined &&
        p.equal(entry.payload.device.id, ownId)
```

## apps/cli/src/notice/command.ts :: callback@33

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
adapters.repo.caseInsensitive(root, true)
```

## apps/cli/src/notice/command.ts :: callback@44

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.repoId
```

## apps/cli/src/notice/command.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
repo !== currentRepo
```

## apps/cli/src/notice/command.ts :: callback@63

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
reportPendingJoins(adapters.home, adapters.now)
```

## apps/cli/src/notice/command.ts :: callback@73

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedcommandNotice(adapters, now, refresh, cwd)
```

## apps/cli/src/notice/command.ts :: callback@92

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
now
```

## apps/cli/src/notice/command.ts :: callback@104

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
resolve(cwd) === item.root || resolve(cwd).startsWith(item.root + sep)
```

## apps/cli/src/notice/fetch.ts :: callback@8

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    signal.throwIfAborted();
    let abort = () => {};

    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });

    try {
      return await Promise.race([fetcher(input, { ...init, signal }), cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
```

## apps/cli/src/notice/fetch.ts :: callback@11

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{}
```

## apps/cli/src/notice/fetch.ts :: callback@13

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    }
```

## apps/cli/src/notice/fetch.ts :: callback@14

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
reject(signal.reason)
```
