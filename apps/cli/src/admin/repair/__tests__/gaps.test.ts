import { test, expect } from "bun:test";
import { deriveGapAction } from "../completion/gaps.ts";

for (const [missing, lost, acceptLost, kind] of [
  [[], [], false, "finish"],
  [[1], [], true, "report"],
  [[], [1], false, "report"],
  [[], [1], true, "finish"],
] as const)
  test(`repair gaps ${missing.length} ${lost.length} ${acceptLost}`, () => {
    expect(deriveGapAction({ missing: [...missing], lost: [...lost] }, acceptLost).kind).toBe(kind);
  });

import * as p from "@envden/core/protocol";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { adminContext } from "../../shared/context.ts";
import { currentHistory } from "../../shared/history.ts";
import { currentMaterial } from "../../shared/material.ts";
import { missingBlobNames } from "../completion/names.ts";
import { rotateVault } from "../../devices/rotate.ts";

test("missing blob names decrypt current and older epochs and preserve missing versus lost", async () => {
  const f = await fixture();

  try {
    const before = await adminContext(f.first, f.now);
    const old = await currentMaterial(before, await currentHistory(before));
    await rotateVault(f.first, "old password", f.now);
    const context = { ...(await adminContext(f.first, f.now)), repairId: new Uint8Array(32) };
    const history = await currentHistory(context);
    const current = await currentMaterial(context, history);

    const entry = (epoch: number, key: Uint8Array, path: string) => {
      const name = { repoId: "github.com/test/repo", path };

      const info = {
        vaultId: context.vaultId,
        epoch,
        fileId: p.fileId(current.ring.idKey, name.repoId, path),
        version: 1n,
      };

      return {
        ...info,
        state: 1,
        blobHash: p.randomBytes(32),
        name: p.sealFileName(name, key, info),
      };
    };

    const missing = entry(current.ring.epoch, current.key, ".env.current");
    const lost = entry(old.ring.epoch, old.key, ".env.old");

    expect(await missingBlobNames(context, history, { missing: [missing], lost: [lost] })).toEqual({
      kind: "missing-blobs",
      missing: [{ repoId: "github.com/test/repo", path: ".env.current" }],
      lost: [{ repoId: "github.com/test/repo", path: ".env.old" }],
    });

    await Promise.resolve(
      expect(
        missingBlobNames(context, history, { missing: [{ ...missing, version: 2n }], lost: [] }),
      ).rejects.toThrow(),
    );
  } finally {
    await f.close();
  }
});
