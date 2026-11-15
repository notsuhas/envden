import { expect, test } from "bun:test";
import { base32, EntryCodec, signObject } from "../../protocol/index.ts";
import { applyEntry } from "../devices/apply.ts";
import { bytes, device, fixture } from "./fixtures.ts";

const rename = (target: Uint8Array, name: string) =>
  ({ kind: 7, payload: { device: target, name } }) as const;

function twoDevices() {
  const f = fixture();

  const added = applyEntry(
    f.state,
    f.entry(f.state, {
      kind: 1,
      payload: {
        device: f.b.record,
        wrap: { recipient: f.b.record.id, enc: bytes(1), ct: bytes(2, 48) },
      },
    }),
  );

  if (added.kind !== "valid") throw new Error("fixture");

  return { f, state: added.state };
}

test("a member renames itself without touching keys or epoch", () => {
  const { f, state } = twoDevices();

  const renamed = applyEntry(state, f.entry(state, rename(f.a.record.id, "laptop")));
  if (renamed.kind !== "valid") throw new Error("rename rejected");

  expect(renamed.state.devices.get(base32(f.a.record.id))).toEqual({
    ...f.a.record,
    name: "laptop",
  });

  expect([renamed.state.epoch, renamed.state.commits]).toEqual([state.epoch, state.commits]);
});

test("rename rejects other signers, non-members, and taken or unchanged names", () => {
  const { f, state } = twoDevices();
  const outsider = device(9);

  for (const [payload, signer] of [
    [rename(f.b.record.id, "laptop"), f.a],
    [rename(f.a.record.id, f.b.record.name), f.a],
    [rename(f.a.record.id, f.a.record.name), f.a],
    [rename(outsider.record.id, "laptop"), f.a],
    [rename(outsider.record.id, "laptop"), outsider],
  ] as const)
    expect(applyEntry(state, f.entry(state, payload, signer)).kind).toBe("invalid");

  const byRecovery = f.entry(state, rename(f.a.record.id, "laptop"));
  byRecovery.body.signer = f.recovery.id;

  const signed = signObject(EntryCodec, byRecovery.body, f.recoveryKeys.objSk, "entry");
  expect(applyEntry(state, signed).kind).toBe("invalid");
});

test("rename rejects names a device record can't hold", () => {
  const { f, state } = twoDevices();

  for (const name of ["", "a".repeat(65), "laptop​"]) {
    const entry = f.entry(state, rename(f.a.record.id, "laptop"));
    if (entry.body.kind === 7) entry.body.payload.name = name;

    expect(applyEntry(state, entry).kind).toBe("invalid");
  }
});
