import { operationSwap } from "./operation-swap.ts";
import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { applyEntry } from "@envden/core/chain";
import { vaultFixture } from "./vault-fixture.ts";

for (const op of [4, 5, 6, 7, 8, 9])
  test(`op ${op} requires its authorization and commits atomically`, async () => {
    const f = await vaultFixture();

    try {
      await f.initialize();
      let state = f.state;
      let previous = f.create.header;

      ({ state, previous } = await prepareOperation(f, op));

      const swap = operationSwap(f, op, state, previous);

      f.storage.putDevice(f.vaultId, f.a.record.id, {
        unlockedUntil: 0,
        freshUntil: 0,
        clientVersion: "1.0.0",
      });

      expect((await f.send(swap)).status).toBe(op === 9 ? 401 : 403);

      const proof =
        op === 9
          ? (r: p.IRequest) => p.Sign(f.sk.objSk, "sk-proof", p.RequestCodec.write(r))
          : undefined;

      if (op !== 9)
        f.storage.putDevice(f.vaultId, f.a.record.id, {
          unlockedUntil: f.options.now() + 10000,
          freshUntil: f.options.now() + 10000,
          clientVersion: "1.0.0",
        });

      if (swap.opaqueRecord) {
        expect((await f.send(swap, f.a, proof)).status).toBe(401);

        f.storage.putSession(
          f.vaultId,
          { kind: "login", device: f.a.record.id, purpose: "registration-record" },
          swap.opaqueRecord,
          f.options.now(),
        );
      }

      expect((await f.send(swap, f.a, proof)).status).toBe(200);

      if (swap.opaqueRecord)
        expect(
          f.storage.session(
            f.vaultId,
            { kind: "login", device: f.a.record.id, purpose: "registration-record" },
            f.options.now(),
          ),
        ).toBeUndefined();

      expect((await f.send(swap, f.a, proof)).status).toBe(200);
    } finally {
      f.close();
    }
  });

test("op 13 needs only an unlocked session and the renamed device's own signature", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    const { state, previous } = await prepareOperation(f, 4);

    const rename = (target: typeof f.a, signer: typeof f.a) =>
      p.signObject(
        p.EntryCodec,
        {
          vaultId: f.vaultId,
          seq: state.seq + 1n,
          parent: state.head,
          kind: 7,
          payload: { device: target.record.id, name: "laptop" },
          signer: signer.record.id,
        },
        signer.keys.objSk,
        "entry",
      );

    const swap = (entry: p.ISigned<p.TEntry>, who: typeof f.a) =>
      f.next(
        previous,
        { op: 13, listSeq: entry.body.seq, listHead: p.objectHash(p.EntryCodec, entry, "entry") },
        [entry],
        who,
      );

    expect((await f.send(swap(rename(f.a, f.b), f.b), f.b)).status).toBe(400);
    expect((await f.send(swap(rename(f.a, f.a), f.b), f.b)).status).toBe(400);

    const own = swap(rename(f.a, f.a), f.a);
    const device = { unlockedUntil: 0, freshUntil: 0, clientVersion: "1.0.0" };
    f.storage.putDevice(f.vaultId, f.a.record.id, device);
    expect((await f.send(own)).status).toBe(403);

    f.storage.putDevice(f.vaultId, f.a.record.id, {
      ...device,
      unlockedUntil: f.options.now() + 10000,
    });

    expect((await f.send(own)).status).toBe(200);
  } finally {
    f.close();
  }
});

async function prepareOperation(f: Awaited<ReturnType<typeof vaultFixture>>, op: number) {
  let state = f.state;
  let previous = f.create.header;

  if (op === 4 || op === 5) {
    const add = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 2n,
        parent: state.head,
        kind: 1,
        payload: {
          device: f.b.record,
          wrap: { recipient: f.b.record.id, enc: p.randomBytes(32), ct: p.randomBytes(48) },
        },
        signer: f.recovery.id,
      },
      f.recoveryKeys.objSk,
      "entry",
    );

    const join = f.next(
      previous,
      { op: 3, listSeq: 2n, listHead: p.objectHash(p.EntryCodec, add, "entry") },
      [add],
      f.b,
    );

    f.storage.putSession(
      f.vaultId,
      { kind: "join-ticket", device: f.b.record.id, purpose: "kit" },
      new Uint8Array([1]),
      f.options.now(),
    );

    expect((await f.send(join, f.b)).status).toBe(200);
    const result = applyEntry(state, add);
    if (result.kind !== "valid") throw new Error("Invalid fixture");
    state = result.state;
    previous = join.header;
  }

  return { state, previous };
}
