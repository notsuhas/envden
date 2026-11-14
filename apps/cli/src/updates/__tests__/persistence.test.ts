import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { rememberRelease, restoreReleases } from "../persistence.ts";
import { checkRelease } from "../check.ts";
import { emptyState } from "../../state/model.ts";

for (const upgrade of [false, true])
  test(`release rotation survives restart and binary upgrade=${upgrade}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-release-state-"));
    const primary = p.generateRecoveryKeys();
    const backup = p.generateRecoveryKeys();

    const next = {
      primary: p.generateRecoveryKeys().objPub,
      backup: p.generateRecoveryKeys().objPub,
    };

    const trust = { generation: 1, keys: { primary: primary.objPub, backup: backup.objPub } };

    const body: p.IRelease = {
      generation: 1,
      seq: 1n,
      issuedAt: 0n,
      expires: 2592000000n,
      latest: "1.0.0",
      unsafe: ["0.0.1"],
      builds: [],
      revokePrimary: 0,
      next,
    };

    const bytes = p.ReleaseFeedCodec.write({
      body,
      signatures: [{ key: 1, sig: p.Sign(backup.objSk, "release", p.ReleaseCodec.write(body)) }],
    });

    try {
      const state = emptyState("test");

      expect(
        (await checkRelease(state, trust, 1, async () => new Response(bytes), true)).kind,
      ).toBe("checked");

      await rememberRelease(home, bytes, state.release);
      const builtin = upgrade ? { generation: 2, keys: next } : trust;
      const restored = await restoreReleases(home, builtin, 2);
      expect(restored?.generation).toBe(2);
      expect(restored?.unsafe).toEqual(["0.0.1"]);
      if (restored) state.release = restored;
      let url = "";

      await checkRelease(
        state,
        builtin,
        3,
        async (input) => {
          url = input instanceof Request ? input.url : input.toString();

          return new Response(null, { status: 404 });
        },
        true,
      );

      expect(url).toContain("release-g2.bin");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
