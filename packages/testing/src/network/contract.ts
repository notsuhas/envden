import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import type { INetworkAdapter, INetworkProblem } from "@envden/core/adapters";

type TNetworkScenario =
  | "ready"
  | INetworkProblem["kind"]
  | "address-taken"
  | "publish-failed"
  | "share-denied"
  | "share-failed";

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

        await rejects(adapter.openPublicShare(8080, "/s/abc"), {
          message: status.problem!.message,
        });
      });
    }

    test("a public share opens on the device's address and closes on request", async () => {
      const adapter = factory("ready");
      const { hostname } = await adapter.status();
      const share = await adapter.openPublicShare(8080, "/s/abc");

      expect(share.url).toStartWith(`https://${hostname}`);
      expect(share.url).toEndWith("/s/abc");
      expect(["public", "unchecked"]).toContain(await share.ready);

      await share.close();
      await share.ended;
    });

    test("a public share is refused where the network forbids it or something already serves", async () => {
      await rejects(factory("share-denied").openPublicShare(8080, "/s/abc"), {
        code: "UNAUTHORIZED",
      });

      await rejects(factory("address-taken").openPublicShare(8080, "/s/abc"), {
        code: "INVALID_INPUT",
      });
    });

    test("a public share that fails to start rejects ready and ends", async () => {
      const share = await factory("share-failed").openPublicShare(8080, "/s/abc");

      await rejects(share.ready);
      await share.ended;
    });

    test("an address already serving something else is not replaced", async () => {
      await rejects(factory("address-taken").expose(8080), { code: "CONFLICT" });
    });

    test("publication failures propagate", async () => {
      await rejects(factory("publish-failed").expose(8080));
    });

    test("invalid ports and paths cannot be published", async () => {
      const adapter = factory("ready");

      for (const port of [0, -1, 65536, 1.5, NaN]) {
        await rejects(adapter.expose(port));
        await rejects(adapter.openPublicShare(port, "/s/abc"));
      }

      for (const path of ["", "/", "s/abc", "/s/../x", "/s/a b", "/s/abc/"])
        await rejects(adapter.openPublicShare(8080, path));
    });
  });
}
