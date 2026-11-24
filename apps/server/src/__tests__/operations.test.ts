import { operationSwap } from "./operation-swap.ts";
import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { applyEntry } from "@envden/core/chain";
import { vaultFixture } from "./vault-fixture.ts";

for (const op of [4, 5, 6, 7])
  test(`op ${op} needs only a member's signature and commits atomically`, async () => {
    const f = await vaultFixture();

    try {
      await f.initialize();
      const { state, previous } = await prepareOperation(f, op);
      const swap = operationSwap(f, op, state, previous);

      expect((await f.send(swap, f.candidate())).status).toBe(401);
      expect((await f.send(swap)).status).toBe(200);
      expect((await f.send(swap)).status).toBe(200);
    } finally {
      f.close();
    }
  });

test("op 13 needs only the renamed device's own signature", async () => {
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

    expect((await f.send(swap(rename(f.a, f.a), f.a))).status).toBe(200);
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
      { kind: "join-ticket", device: f.b.record.id, purpose: "recovery" },
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
