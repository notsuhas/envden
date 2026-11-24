import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { adminContext } from "../../shared/context.ts";
import { currentHistory } from "../../shared/history.ts";
import { removeDevice } from "../remove.ts";
import { pull } from "../../../sync/engine.ts";

test("a member's unreadable file name blocks neither pull nor its removal", async () => {
  const f = await fixture(["second"]);

  try {
    const attacker = f.joined.second!;

    const context = await adminContext(attacker, f.now);
    const history = await currentHistory(context);
    const prev = history.headers.at(-1)!;

    const files = {
      entries: [
        {
          fileId: p.randomBytes(32),
          version: 1n,
          epoch: history.state.epoch,
          state: 2,
          blobHash: new Uint8Array(32),
          name: new Uint8Array([1]),
        },
      ],
    };

    const header = p.signObject(
      p.ManifestHeaderCodec,
      {
        ...prev.body,
        seq: prev.body.seq + 1n,
        prev: p.objectHash(p.ManifestHeaderCodec, prev, "manifest"),
        op: 1,
        filesHash: p.H("files", p.FilesCodec.write(files)),
        signer: context.identity.record.id,
      },
      context.identity.keys.objSk,
      "manifest",
    );

    await context.client.request(
      "/v1/swap",
      "POST",
      p.SwapCodec.write({
        expectedHead: header.body.prev,
        header,
        files,
        entries: [],
        keyring: undefined,
        envelope: undefined,
        proofPub: undefined,
        approver: undefined,
      }),
    );

    await pull(f.first, { all: true, now: f.now, fetcher: f.fetcher });

    const removed = await removeDevice(
      f.first,
      "second",
      f.now,
      f.fetcher,
      true,
      undefined,
      undefined,
      async () => {},
    );

    expect(removed).toMatchObject({ exposure: { incomplete: true } });

    const after = await currentHistory(await adminContext(f.first, f.now));
    expect(after.state.devices.has(p.base32(context.identity.record.id))).toBe(false);
  } finally {
    await f.close();
  }
});
