import { expect, test } from "bun:test";
import { FilesCodec, H, ManifestHeaderCodec, signObject } from "../../protocol/index.ts";
import { validateSwap } from "../swaps/validate.ts";
import { bytes } from "./fixtures.ts";
import { swapFixture } from "./swap-fixture.ts";

import type { TAuthorization } from "../swaps/operation.ts";

const requirements: TAuthorization[] = [
  "unlocked",
  "mailbox-grant",
  "join-ticket",
  "fresh-or-repair-token",
  "fresh",
  "fresh",
  "fresh",
  "fresh",
  "sk-proof",
  "move-session",
  "repair-token",
  "repair-token",
];

for (let op = 1; op <= 12; op++) {
  test(`op ${op} accepts exact shape and reports authorization`, () => {
    const f = swapFixture(op);
    const result = validateSwap(f.swap, f.context);
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") expect(result.authorization).toBe(requirements[op - 1]!);
  });

  test(`op ${op} rejects absent or extra fields, entries, mismatched op and request signer`, () => {
    const f = swapFixture(op);
    const fields = ["files", "keyring", "envelope", "skPub", "opaqueRecord", "approver"] as const;

    for (const field of fields) {
      const bad = { ...f.swap };

      if (field === "files") bad.files = f.swap.files ? undefined : { entries: [] };
      else bad[field] = f.swap[field] ? undefined : bytes(33);

      expect(validateSwap(bad, f.context).kind).toBe("invalid");
    }

    expect(validateSwap({ ...f.swap, entries: [...f.swap.entries, f.epoch] }, f.context).kind).toBe(
      "invalid",
    );

    expect(validateSwap(f.swap, { ...f.context, requestSigner: bytes(0, 16) }).kind).toBe(
      "invalid",
    );

    const body = { ...f.swap.header.body, op: op === 1 ? 8 : 1 };

    expect(
      validateSwap(
        { ...f.swap, header: signObject(ManifestHeaderCodec, body, f.a.keys.objSk, "manifest") },
        f.context,
      ).kind,
    ).toBe("invalid");
  });
}

test("op10 forwarding on N permits any member and checks N's pin", () => {
  const f = swapFixture(10);
  expect(validateSwap(f.swap, { ...f.context, destinationPin: bytes(15) }).kind).toBe("valid");
  expect(validateSwap(f.swap, { ...f.context, destinationPin: bytes(16) }).kind).toBe("invalid");
});

test("repair fix only changes missing live entries to states 3/4 in current epoch", () => {
  const f = swapFixture(11);
  expect(validateSwap(f.swap, { ...f.context, missingBlobs: new Set() }).kind).toBe("invalid");

  for (const state of [1, 2]) {
    const files = { entries: f.swap.files!.entries.map((e) => ({ ...e, state })) };

    const header = signObject(
      ManifestHeaderCodec,
      { ...f.swap.header.body, filesHash: H("files", FilesCodec.write(files)) },
      f.a.keys.objSk,
      "manifest",
    );

    expect(validateSwap({ ...f.swap, files, header }, f.context).kind).toBe("invalid");
  }
});

test("op10 forwards an unchanged header signed by a different member only on N", () => {
  const f = swapFixture(4);
  const state = f.context.state;

  const move = f.entry(state, {
    kind: 5,
    payload: { oldPin: state.serverPin, newPin: bytes(15), newAddress: "next.example" },
  });

  const header = signedHeader(f.context.previous, {
    op: 10,
    listSeq: move.body.seq,
    listHead: objectHash(EntryCodec, move, "entry"),
  });

  const swap = { ...f.swap, entries: [move], header, keyring: undefined };
  const other = [...state.devices.values()].find((d) => !equal(d.id, f.a.record.id))!;
  const context = { ...f.context, requestSigner: other.id };
  expect(validateSwap(swap, context).kind).toBe("invalid");
  expect(validateSwap(swap, { ...context, destinationPin: bytes(15) }).kind).toBe("valid");
});

test("repair-done requires restoredHead to be an earlier verified header", () => {
  const f = swapFixture(12);
  const entry = f.swap.entries[0]!.body;
  if (entry.kind !== 6) throw new Error("fixture");

  const done = signObject(
    EntryCodec,
    { ...entry, payload: { ...entry.payload, restoredHead: bytes(99) } },
    f.a.keys.objSk,
    "entry",
  );

  const header = signObject(
    ManifestHeaderCodec,
    { ...f.swap.header.body, listHead: objectHash(EntryCodec, done, "entry") },
    f.a.keys.objSk,
    "manifest",
  );

  expect(validateSwap({ ...f.swap, entries: [done], header }, f.context).kind).toBe("invalid");
});

import { EntryCodec, objectHash, equal } from "../../protocol/index.ts";
import { signedHeader } from "./fixtures.ts";

test("repair-done carries an OPAQUE record exactly when re-registering", () => {
  const f = swapFixture(12);
  const registration = { ...f.context, repairRegistrationRequired: true };
  expect(validateSwap(f.swap, registration).kind).toBe("invalid");
  expect(validateSwap({ ...f.swap, opaqueRecord: bytes(1, 192) }, registration).kind).toBe("valid");
  expect(validateSwap({ ...f.swap, opaqueRecord: bytes(1, 192) }, f.context).kind).toBe("invalid");
});

test("swap optional payloads enforce public key, record and approver shapes", () => {
  const kit = swapFixture(7);

  for (const skPub of [bytes(0), Uint8Array.of(1, ...new Uint8Array(31)), bytes(1, 31)])
    expect(validateSwap({ ...kit.swap, skPub }, kit.context).kind).toBe("invalid");

  const password = swapFixture(8);

  for (const length of [0, 191, 193])
    expect(
      validateSwap({ ...password.swap, opaqueRecord: bytes(1, length) }, password.context).kind,
    ).toBe("invalid");

  const pair = swapFixture(2);
  expect(validateSwap({ ...pair.swap, approver: bytes(1, 4096) }, pair.context).kind).toBe("valid");

  expect(validateSwap({ ...pair.swap, approver: bytes(1, 4097) }, pair.context).kind).toBe(
    "invalid",
  );
});

test("swap validation preserves unexpected failures", () => {
  const f = swapFixture(1);
  const failure = new Error("programmer failure");

  Object.defineProperty(f.swap, "header", {
    get: () => {
      throw failure;
    },
  });

  expect(() => validateSwap(f.swap, f.context)).toThrow(failure);
});
