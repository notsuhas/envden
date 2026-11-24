import { expect, test } from "bun:test";
import { FilesCodec, H, ManifestHeaderCodec, signObject } from "../../protocol/index.ts";
import { validateSwap } from "../swaps/validate.ts";
import { operationRequirement } from "../swaps/operation.ts";
import { bytes } from "./fixtures.ts";
import { swapFixture } from "./swap-fixture.ts";

import type { TAuthorization } from "../swaps/operation.ts";

const requirements: Record<number, TAuthorization> = {
  1: "member",
  2: "join-grant",
  3: "join-ticket",
  4: "member-or-repair-token",
  5: "member",
  6: "member",
  7: "member",
  10: "move-session",
  11: "repair-token",
  12: "repair-token",
  13: "member",
};

for (const op of Object.keys(requirements).map(Number)) {
  test(`op ${op} accepts exact shape and reports authorization`, () => {
    const f = swapFixture(op);
    const result = validateSwap(f.swap, f.context);
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") expect(result.authorization).toBe(requirements[op]!);
  });

  test(`op ${op} rejects absent or extra fields, entries, mismatched op and request signer`, () => {
    const f = swapFixture(op);
    const fields = ["files", "keyring", "envelope", "proofPub", "approver"] as const;

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

    const body = { ...f.swap.header.body, op: op === 1 ? 6 : 1 };

    expect(
      validateSwap(
        { ...f.swap, header: signObject(ManifestHeaderCodec, body, f.a.keys.objSk, "manifest") },
        f.context,
      ).kind,
    ).toBe("invalid");
  });
}

test("op 13 requires the header signer to be the renamed device", () => {
  const f = swapFixture(13);
  const header = { ...f.swap.header.body, signer: f.b.record.id };

  expect(() =>
    operationRequirement(f.context.previous.body, header, f.swap.entries, f.context.state),
  ).toThrow();
});

test("op10 forwarding on N permits any member and checks N's pin", () => {
  const f = swapFixture(10);
  expect(validateSwap(f.swap, { ...f.context, destinationPin: bytes(15) }).kind).toBe("valid");
  expect(validateSwap(f.swap, { ...f.context, destinationPin: bytes(16) }).kind).toBe("invalid");
});

test("repair fix only changes missing live entries to states 3/4 in current epoch", () => {
  const f = swapFixture(11);
  expect(validateSwap(f.swap, { ...f.context, missingBlobs: new Set() }).kind).toBe("invalid");

  for (const state of [1, 2]) {
    const files = {
      entries: f.swap.files!.entries.map((e) => ({
        ...e,
        state,
        blobHash: state === 1 ? bytes(23) : e.blobHash,
      })),
    };

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

test("ops 8 and 9 are unassigned", () => {
  const f = swapFixture(6);

  for (const op of [8, 9]) {
    const header = signObject(
      ManifestHeaderCodec,
      { ...f.swap.header.body, op },
      f.a.keys.objSk,
      "manifest",
    );

    expect(validateSwap({ ...f.swap, header }, f.context).kind).toBe("invalid");
  }
});

test("swap optional payloads enforce public key and approver shapes", () => {
  const code = swapFixture(7);

  for (const proofPub of [bytes(0), Uint8Array.of(1, ...new Uint8Array(31)), bytes(1, 31)])
    expect(validateSwap({ ...code.swap, proofPub }, code.context).kind).toBe("invalid");

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
