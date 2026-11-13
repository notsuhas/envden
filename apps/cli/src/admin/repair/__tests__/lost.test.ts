import { test, expect, spyOn } from "bun:test";
import { cp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@envden/server";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { atomicWrite } from "../../../state/files.ts";
import { loadState, saveState } from "../../../state/repository.ts";
import { linkCheckout } from "../../../links/place.ts";
import { pushInitialFiles } from "../../../vault/initial/push.ts";
import { kitJoin } from "../../../vault/recovery/kit.ts";
import { push, pull } from "../../../sync/engine.ts";
import { uploadRepair } from "../upload.ts";
import { finishRepair } from "../finish.ts";

for (const recovered of [true, false])
  test(`accept-lost ${recovered ? "recovers an older version" : "marks a file lost"} and offline pull crosses op 11`, async () => {
    const f = await fixture();
    let current = f.running;

    try {
      const checkout = {
        root: join(f.root, "checkout"),
        gitDir: join(f.root, "checkout", ".git"),
        repoId: "github.com/test/repair",
      };

      f.first.repo = createFakeRepoAdapter({
        checkoutAt: async () => checkout,
        envFiles: async () => [".env"],
        ensureIgnored: async () => {},
      });

      await atomicWrite(join(checkout.root, ".env"), "VALUE=older\n");
      const state = (await loadState(f.first.home))!;
      await linkCheckout(f.first, state, checkout, async () => true);
      await pushInitialFiles(f.first, state, f.now);
      const second = f.home("second");

      await kitJoin(second, {
        ...f.result.kit,
        address: f.result.kit.server,
        password: "old password",
        name: "second",
        now: f.now,
        fetcher: fetch,
      });

      const checkoutB = {
        ...checkout,
        root: join(f.root, "checkout-b"),
        gitDir: join(f.root, "checkout-b", ".git"),
      };

      second.repo = createFakeRepoAdapter({
        checkoutAt: async () => checkoutB,
        ensureIgnored: async () => {},
      });

      await mkdir(checkoutB.root, { recursive: true });
      const bState = (await loadState(second.home))!;
      bState.approved.push(checkoutB);
      await saveState(second.home, bState);
      const opts = { now: f.now, fetcher: fetch, all: true, yes: true };
      await pull(second, opts);
      const aStore = (await loadState(f.first.home))!.links[0]!.store;
      const bStore = (await loadState(second.home))!.links[0]!.store;
      await current.server.stop(true);
      current.stopPruning();
      current.storage.close();
      await cp(join(f.root, "server"), join(f.root, "backup"), { recursive: true });
      current = await serve({ dataDir: join(f.root, "server"), port: 0 });

      const point = async (home: typeof f.first) => {
        const local = (await loadState(home.home))!;
        local.server!.address = current.server.url.toString();
        await saveState(home.home, local);
      };

      await point(f.first);
      await atomicWrite(aStore, "VALUE=newest\n");
      await push(f.first, opts);
      await rm(join(f.first.home, "state", "blobs"), { recursive: true, force: true });

      if (!recovered)
        await rm(join(second.home, "state", "blobs"), { recursive: true, force: true });

      await current.server.stop(true);
      current.stopPruning();
      current.storage.close();
      if (!recovered) await rm(join(f.root, "backup", "blobs"), { recursive: true, force: true });
      const log = spyOn(console, "log").mockImplementation(() => {});
      current = await serve({ dataDir: join(f.root, "backup"), port: 0, restored: true });

      const token = log.mock.calls
        .flat()
        .find((v) => typeof v === "string" && v.startsWith("envden-repair-1:"));

      log.mockRestore();
      if (typeof token !== "string") throw new Error("Missing repair token");
      await point(f.first);
      await point(second);
      await uploadRepair(f.first, token, f.now);
      await uploadRepair(second, token, f.now);

      const finish = await finishRepair(f.first, {
        token,
        password: "old password",
        acceptLost: true,
        now: f.now,
        fetcher: fetch,
      });

      expect(finish.kind).toBe("finished");

      if (finish.kind === "finished")
        expect(finish.report).toContain(recovered ? "recovered from" : "lost;");

      await atomicWrite(aStore, "VALUE=after-repair\n");
      await push(f.first, opts);
      const reports: string[] = [];
      const pulled = await pull(second, { ...opts, report: (message) => reports.push(message) });
      expect(pulled.conflicts).toBe(1);
      expect(await readFile(bStore, "utf8")).toBe("VALUE=older\n");
      expect(reports.some((line) => line.includes("Repair changed file"))).toBe(true);
    } finally {
      await current.server.stop(true);
      current.stopPruning();
      current.storage.close();
      await f.close();
    }
  });
