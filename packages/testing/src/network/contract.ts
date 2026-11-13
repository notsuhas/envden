import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import type { INetworkAdapter } from "@envden/core/adapters";

type TNetworkScenario =
  | "ready"
  | "unavailable"
  | "logged-out"
  | "https-disabled"
  | "publish-failed";

export function networkContract(
  name: string,
  factory: (scenario: TNetworkScenario) => INetworkAdapter,
): void {
  describe(name, () => {
    test("ready status publishes a secure device address", async () => {
      const adapter = factory("ready");
      const status = await adapter.status();
      expect(status.ready).toBe(true);
      expect(status.running).toBe(true);
      expect(status.loggedIn).toBe(true);
      expect(status.httpsEnabled).toBe(true);
      expect(await adapter.checkHttpsCertificate()).toBe(true);
      expect(status.hostname).toBeTruthy();
      expect(await adapter.expose(8080)).toBe(`https://${status.hostname}`);
    });

    for (const scenario of ["unavailable", "logged-out", "https-disabled"] as const) {
      test(`${scenario} fails closed`, async () => {
        const adapter = factory(scenario);
        const status = await adapter.status();
        expect(status.ready).toBe(false);
        expect(status.problem).toBeTruthy();
        await rejects(adapter.expose(8080));
      });
    }

    test("publication failures propagate", async () => {
      await rejects(factory("publish-failed").expose(8080));
    });

    test("invalid ports cannot be published", async () => {
      const adapter = factory("ready");

      for (const port of [0, -1, 65536, 1.5, NaN]) await rejects(adapter.expose(port));
    });
  });
}
