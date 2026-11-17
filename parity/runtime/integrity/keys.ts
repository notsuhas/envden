import { basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { retainedFiles } from "./walk.ts";
import { check } from "./objects.ts";

interface IIdentity {
  encSk: Uint8Array;
  record: p.IDeviceRecord;
}

export async function fixtureKeys(root: string, semantics: Map<string, unknown>) {
  const keys: Uint8Array[] = [];
  const identities: IIdentity[] = [];

  for await (const path of retainedFiles(root)) {
    if (!path.includes("/state/keys/") || !path.endsWith(".key")) continue;
    const bytes = await readFile(path);

    if (await identitySlot(path)) {
      const identity = checkedIdentity(bytes);
      identities.push(identity);
      semantics.set(`${path}/identity`, identity.record);
    } else if (bytes.length === 32) keys.push(bytes);
  }

  return { keys, identities };
}

function checkedIdentity(bytes: Uint8Array): IIdentity {
  check(bytes.length >= 96);
  const record = p.decode(p.DeviceRecordCodec, bytes.subarray(96));
  const seeds = [bytes.subarray(0, 32), bytes.subarray(32, 64), bytes.subarray(64, 96)];
  let index = 0;
  const derived = p.generateDeviceKeys(() => seeds[index++]!);
  check(p.equal(derived.encPub, record.encPub));
  check(p.equal(derived.objPub, record.objPub));
  check(p.equal(derived.reqPub, record.reqPub));
  check(p.equal(p.deviceId(record), record.id));

  return { encSk: seeds[0]!, record };
}

export async function unwrapKeys(
  entries: p.TEntry[],
  identities: IIdentity[],
  keys: Uint8Array[],
): Promise<void> {
  for (const entry of entries) {
    if (entry.kind !== 2 && entry.kind !== 3 && entry.kind !== 4) continue;
    const change = entry.payload.change;

    for (const identity of identities) {
      const wrap = change.wraps.find((w) => p.equal(w.recipient, identity.record.id));
      if (!wrap) continue;

      keys.push(
        await p.openWrap(
          wrap,
          identity.encSk,
          identity.record.encPub,
          entry.vaultId,
          change.epoch,
          change.keyCommit,
        ),
      );
    }
  }
}

async function identitySlot(path: string): Promise<boolean> {
  const home = await realpath(dirname(dirname(dirname(path))));

  return ["device", "rejoin/device"].some(
    (slot) =>
      `${createHash("sha256").update(`envden/${home}/${slot}`).digest("hex")}.key` ===
      basename(path),
  );
}
