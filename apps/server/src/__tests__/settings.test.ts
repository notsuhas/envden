import { expect, test } from "bun:test";
import { UnlockPeriodSchema, UnlockWindowSchema } from "@envden/core/protocol";
import { fixture, identity, vaultId } from "./fixture.ts";

for (const period of [null, 86400000] as const)
  test(`read unlock period ${period} and window require unlocked membership, no fresh login or body budget`, async () => {
    const f = fixture(await identity());
    const path = "/v1/settings/unlock-period";
    const windowPath = "/v1/unlock-window";
    const release = f.reserveBody(134217728);

    try {
      expect((await f.request(path).send()).status).toBe(403);
      expect((await f.request(path, undefined, { who: f.joiner }).send()).status).toBe(403);
      expect((await f.request(windowPath).send()).status).toBe(403);
      f.storage.configureVault(vaultId, { ...f.storage.vault(vaultId)!, unlockPeriod: period });

      f.storage.putDevice(vaultId, f.member.record.id, {
        ...f.storage.device(vaultId, f.member.record.id)!,
        unlockedUntil: f.options.now() + 10000,
        freshUntil: 0,
      });

      const response = await f.request(path).send();
      expect(response.status).toBe(200);
      expect(UnlockPeriodSchema.parse(await response.json())).toEqual({ period });
      const window = await f.request(windowPath).send();

      expect(UnlockWindowSchema.parse(await window.json())).toEqual({
        unlockedUntil: period === null ? null : f.options.now() + 10000,
        freshUntil: 0,
      });

      expect((await f.request(path, { period }, { method: "PUT" }).send()).status).toBe(403);
    } finally {
      release();
      f.close();
    }
  });
