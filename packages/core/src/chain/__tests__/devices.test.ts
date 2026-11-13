import { expect, test } from "bun:test";
import {
  compare,
  EntryCodec,
  signObject,
  generateRecoveryKeys,
  recoveryId,
} from "../../protocol/index.ts";
import { applyEntry, verifyChain } from "../devices/apply.ts";
import { bytes, device, fixture, rng } from "./fixtures.ts";

const addPayload = (d = device(2).record) =>
  ({
    kind: 1,
    payload: { device: d, wrap: { recipient: d.id, enc: bytes(1), ct: bytes(2, 48) } },
  }) as const;

test("genesis and epoch verify, empty and repeated genesis fail", () => {
  const f = fixture();
  expect(verifyChain([f.genesis, f.epoch]).kind).toBe("valid");
  expect(verifyChain([]).kind).toBe("invalid");
  expect(applyEntry(f.state, f.genesis).kind).toBe("invalid");
});

for (const field of ["vaultId", "parent", "seq", "signer", "signature"] as const) {
  test(`entry rejects wrong ${field}`, () => {
    const f = fixture();
    const e = f.entry(f.state, addPayload());

    if (field === "signature") e.signature = bytes(0, 64);
    else if (field === "seq") e.body.seq += 1n;
    else e.body[field] = bytes(0, field === "signer" ? 16 : 32);

    expect(applyEntry(f.state, e).kind).toBe("invalid");
  });
}

test("first entry must create epoch one, genesis signature and ID are checked", () => {
  const f = fixture();
  const initial = applyEntry(undefined, f.genesis);
  expect(initial.kind).toBe("valid");
  if (initial.kind !== "valid") return;
  expect(applyEntry(initial.state, f.entry(initial.state, addPayload())).kind).toBe("invalid");

  expect(
    applyEntry(
      initial.state,
      f.entry(initial.state, {
        kind: 3,
        payload: { change: { ...f.change(initial.state), epoch: 2 } },
      }),
    ).kind,
  ).toBe("invalid");

  expect(applyEntry(undefined, { ...f.genesis, signature: bytes(0, 64) }).kind).toBe("invalid");

  expect(
    applyEntry(undefined, { ...f.genesis, body: { ...f.genesis.body, vaultId: bytes(2) } }).kind,
  ).toBe("invalid");
});

test("add validates name, ID, recipient, cap and preserves previous state", () => {
  const f = fixture();
  const added = applyEntry(f.state, f.entry(f.state, addPayload()));
  expect(added.kind).toBe("valid");
  expect(f.state.devices.size).toBe(1);
  if (added.kind !== "valid") return;
  expect(applyEntry(added.state, f.entry(added.state, addPayload())).kind).toBe("invalid");

  for (const d of [{ ...f.b.record, name: f.a.record.name }]) {
    expect(applyEntry(f.state, f.entry(f.state, addPayload(d))).kind).toBe("invalid");
  }

  const wrongWrap = addPayload();

  const invalidWrap = {
    ...wrongWrap,
    payload: {
      ...wrongWrap.payload,
      wrap: { ...wrongWrap.payload.wrap, recipient: f.a.record.id },
    },
  };

  expect(applyEntry(f.state, f.entry(f.state, invalidWrap)).kind).toBe("invalid");

  const full = {
    ...f.state,
    devices: new Map(Array.from({ length: 64 }, (_, i) => [String(i), f.a.record])),
  };

  expect(applyEntry(full, f.entry(full, addPayload())).kind).toBe("invalid");
});

test("recovery signs only add, device and recovery IDs can never be reused", () => {
  const f = fixture();
  const add = f.entry(f.state, addPayload());
  add.body.signer = f.recovery.id;
  const signed = signObject(EntryCodec, add.body, f.recoveryKeys.objSk, "entry");
  expect(applyEntry(f.state, signed).kind).toBe("valid");
  const rotate = f.entry(f.state, { kind: 3, payload: { change: f.change(f.state) } });
  rotate.body.signer = f.recovery.id;

  expect(
    applyEntry(f.state, signObject(EntryCodec, rotate.body, f.recoveryKeys.objSk, "entry")).kind,
  ).toBe("invalid");

  expect(
    applyEntry(
      f.state,
      f.entry(f.state, { kind: 4, payload: { recovery: f.recovery, change: f.change(f.state) } }),
    ).kind,
  ).toBe("invalid");
});

test("remove rejects self, last and unknown; removed signers and reused IDs fail", () => {
  const f = fixture();

  for (const target of [f.a.record.id, f.b.record.id, f.recovery.id]) {
    expect(
      applyEntry(
        f.state,
        f.entry(f.state, {
          kind: 2,
          payload: { device: target, newRecovery: undefined, change: f.change(f.state) },
        }),
      ).kind,
    ).toBe("invalid");
  }

  const added = applyEntry(f.state, f.entry(f.state, addPayload()));
  if (added.kind !== "valid") throw new Error("fixture");
  const state = added.state;

  const removed = applyEntry(
    state,
    f.entry(state, {
      kind: 2,
      payload: {
        device: f.b.record.id,
        newRecovery: undefined,
        change: f.change(state, [f.a.record]),
      },
    }),
  );

  expect(removed.kind).toBe("valid");
  if (removed.kind !== "valid") return;
  expect(applyEntry(removed.state, f.entry(removed.state, addPayload())).kind).toBe("invalid");

  expect(
    applyEntry(
      removed.state,
      f.entry(removed.state, { kind: 3, payload: { change: f.change(removed.state) } }, f.b),
    ).kind,
  ).toBe("invalid");

  expect(
    applyEntry(
      state,
      f.entry(state, {
        kind: 2,
        payload: {
          device: f.a.record.id,
          newRecovery: undefined,
          change: f.change(state, [f.b.record]),
        },
      }),
    ).kind,
  ).toBe("invalid");
});

for (const bad of ["epoch", "missing", "extra", "duplicate"] as const) {
  test(`epoch rejects ${bad}`, () => {
    const f = fixture();
    const change = f.change(f.state);
    if (bad === "epoch") change.epoch += 1;
    if (bad === "missing") change.wraps.pop();

    if (bad === "extra")
      change.wraps.push({ recipient: f.b.record.id, enc: bytes(0), ct: bytes(0, 48) });

    if (bad === "duplicate") {
      const entry = f.entry(f.state, { kind: 3, payload: { change } });
      change.wraps.push(change.wraps[0]!);
      expect(applyEntry(f.state, entry).kind).toBe("invalid");

      return;
    }

    change.wraps.sort((a, b) => compare(a.recipient, b.recipient));

    expect(applyEntry(f.state, f.entry(f.state, { kind: 3, payload: { change } })).kind).toBe(
      "invalid",
    );
  });
}

test("recovery replacement, pin update and repair ID uniqueness", () => {
  const f = fixture();
  const keys = generateRecoveryKeys(rng(12));
  const recovery = { ...keys, id: recoveryId(keys) };

  expect(
    applyEntry(
      f.state,
      f.entry(f.state, {
        kind: 4,
        payload: { recovery, change: f.change(f.state, [f.a.record], recovery) },
      }),
    ).kind,
  ).toBe("valid");

  const move = {
    kind: 5,
    payload: { oldPin: f.state.serverPin, newPin: bytes(20), newAddress: "new.example" },
  } as const;

  const moved = applyEntry(f.state, f.entry(f.state, move));
  expect(moved.kind).toBe("valid");
  if (moved.kind === "valid") expect(moved.state.serverPin).toEqual(bytes(20));

  expect(
    applyEntry(
      f.state,
      f.entry(f.state, { ...move, payload: { ...move.payload, oldPin: bytes(0) } }),
    ).kind,
  ).toBe("invalid");

  const done = { kind: 6, payload: { repairId: bytes(21), restoredHead: bytes(22) } } as const;
  const repaired = applyEntry(f.state, f.entry(f.state, done));
  expect(repaired.kind).toBe("valid");

  if (repaired.kind === "valid")
    expect(applyEntry(repaired.state, f.entry(repaired.state, done)).kind).toBe("invalid");
});
