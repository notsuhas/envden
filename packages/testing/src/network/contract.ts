import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import type { INetworkAdapter, INetworkProblem } from "@envden/core/adapters";

type TNetworkScenario = "ready" | INetworkProblem["kind"] | "address-taken" | "publish-failed";

const problems = [
  "not-installed",
  "not-running",
  "logged-out",
  "https-disabled",
  "unreadable",
] as const satisfies INetworkProblem["kind"][];

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
      expect(status.problem).toBeUndefined();
      expect(await adapter.checkHttpsCertificate()).toEqual({ kind: "ready" });
      expect(status.hostname).toBeTruthy();
      expect(await adapter.expose(8080)).toBe(`https://${status.hostname}:8080`);
    });

    for (const scenario of problems) {
      test(`${scenario} fails closed and names the cause`, async () => {
        const adapter = factory(scenario);
        const status = await adapter.status();
        expect(status.ready).toBe(false);
        expect(status.problem?.kind).toBe(scenario);
        expect(status.problem?.message).toBeTruthy();
        expect(await adapter.checkHttpsCertificate()).toEqual(status.problem!);
        await rejects(adapter.expose(8080), { message: status.problem!.message });
      });
    }

    test("an address already serving something else is not replaced", async () => {
      await rejects(factory("address-taken").expose(8080), { code: "CONFLICT" });
    });

    test("publication failures propagate", async () => {
      await rejects(factory("publish-failed").expose(8080));
    });

    test("invalid ports cannot be published", async () => {
      const adapter = factory("ready");

      for (const port of [0, -1, 65536, 1.5, NaN]) await rejects(adapter.expose(port));
    });
  });
}
