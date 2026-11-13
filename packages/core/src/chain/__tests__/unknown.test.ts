import { expect, test } from "bun:test";
import { classifyUnknownData } from "../index.ts";
import { bytes } from "./fixtures.ts";

test("unknown-data classification compares bytes before signature before format", () => {
  const input = {
    received: bytes(1),
    stored: bytes(2),
    mismatch: "fork",
    verify: () => {
      throw new Error("must not run before comparison");
    },
    unknownFormat: true,
    currentVersion: "1.0.0",
    latestVersion: "2.0.0",
  } as const;

  expect(classifyUnknownData(input).kind).toBe("fork");
  expect(classifyUnknownData({ ...input, mismatch: "rollback" }).kind).toBe("rollback");
  expect(classifyUnknownData({ ...input, stored: bytes(1) }).kind).toBe("invalid");

  expect(classifyUnknownData({ ...input, stored: undefined, verify: () => false }).kind).toBe(
    "invalid",
  );

  expect(classifyUnknownData({ ...input, stored: undefined, verify: () => true }).kind).toBe(
    "update-required",
  );

  expect(
    classifyUnknownData({
      ...input,
      stored: undefined,
      verify: () => true,
      currentVersion: "2.0.0",
    }).kind,
  ).toBe("unreadable");

  expect(
    classifyUnknownData({ ...input, stored: undefined, verify: () => true, unknownFormat: false })
      .kind,
  ).toBe("known");
});

import { decodeServerObject } from "../index.ts";
import {
  EntryCodec,
  Sign,
  concat,
  encode,
  verifyRawObject,
  header,
  u64,
} from "../../protocol/index.ts";
import { fixture } from "./fixtures.ts";

test("unknown entry kind is authenticated over its exact raw bytes", () => {
  const f = fixture();
  const entry = f.entry(f.state, { kind: 3, payload: { change: f.change(f.state) } });
  const body = encode(EntryCodec, entry.body);

  const entryKindOffset =
    header(1).length +
    entry.body.vaultId.length +
    u64.write(entry.body.seq).length +
    entry.body.parent.length;

  body[entryKindOffset] = 99;
  const received = concat(body, Sign(f.a.keys.objSk, "entry", body));

  const input = {
    received,
    codec: EntryCodec,
    label: "entry",
    mismatch: "fork",
    members: [...f.state.devices.values(), f.state.recovery],
    currentVersion: "1.0.0",
    latestVersion: "2.0.0",
  } as const;

  expect(verifyRawObject(received, input.members, "entry").ok).toBe(true);
  expect(decodeServerObject(input).kind).toBe("update-required");
  expect(decodeServerObject({ ...input, latestVersion: "1.0.0" }).kind).toBe("unreadable");
  const bad = received.slice();
  bad[bad.length - 1] = bad[bad.length - 1]! ^ 1;
  expect(decodeServerObject({ ...input, received: bad }).kind).toBe("invalid");
  expect(decodeServerObject({ ...input, received: received.subarray(0, 20) }).kind).toBe("invalid");
  expect(decodeServerObject({ ...input, stored: bad }).kind).toBe("fork");
});
