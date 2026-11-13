import { checkCrash } from "./crash.ts";
import * as p from "@envden/core/protocol";
import { changePassword } from "../../recovery/credentials.ts";
import { kitRejoin } from "../../rejoin/kit.ts";
import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { serve } from "@envden/server";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { kitJoin } from "../../../vault/recovery/kit.ts";
import { rotateVault } from "../../devices/rotate.ts";
import { uploadRepair } from "../upload.ts";
import { finishRepair } from "../finish.ts";
import { saveState, loadState } from "../../../state/repository.ts";

for (const mode of ["rotate", "password", "missing-envelope"] as const)
  for (const crash of ["none", "before-close", "after-close", "adoption"] as const)
    for (const drop of [false, true])
      test(`restore repair ${mode} ${crash} ${drop ? "drops an unreported member" : "combines two device reports"}`, async () => {
        const f = await fixture();
        const second = f.home("second");

        await kitJoin(second, {
          ...f.result.kit,
          address: f.result.kit.server,
          password: "old password",
          name: "second",
          now: f.now,
          fetcher: fetch,
        });

        await f.running.server.stop(true);
        f.running.stopPruning();
        f.running.storage.close();
        await cp(join(f.root, "server"), join(f.root, "backup"), { recursive: true });
        let current = await serve({ dataDir: join(f.root, "server"), port: 0 });

        const point = async (home: typeof f.first, address: string) => {
          const state = await loadState(home.home);
          if (!state?.server) throw new Error("Missing server");
          state.server.address = address;
          await saveState(home.home, state);
        };

        await point(f.first, current.server.url.toString());

        if (mode === "password")
          await changePassword(
            f.first,
            "old password",
            "new password",
            f.result.kit.secretKey,
            f.now,
          );
        else await rotateVault(f.first, "old password", f.now);

        await current.server.stop(true);
        current.stopPruning();
        current.storage.close();
        const log = spyOn(console, "log").mockImplementation(() => {});
        current = await serve({ dataDir: join(f.root, "backup"), port: 0, restored: true });

        const token = log.mock.calls
          .flat()
          .find((v) => typeof v === "string" && v.startsWith("envden-repair-1:"));

        log.mockRestore();

        try {
          if (typeof token !== "string") throw new Error("Missing repair token");
          await point(f.first, current.server.url.toString());
          await point(second, current.server.url.toString());
          await uploadRepair(f.first, token, f.now);
          if (!drop) await uploadRepair(second, token, f.now);

          if (mode === "missing-envelope")
            current.storage.writeState(p.unbase32(f.result.kit.vaultId), [
              { kind: "envelope", key: new Uint8Array() },
            ]);

          const password = mode === "password" ? "new password" : "old password";

          const options = {
            token,
            password,
            ...(drop ? { without: ["second"] } : {}),
            now: f.now,
            fetcher: fetch,
          };

          await checkCrash(f.first, options, crash);

          const result = await finishRepair(f.first, options);

          expectFinished(result, mode);

          if (drop && mode !== "missing-envelope") {
            const joined = await kitRejoin(second, {
              ...f.result.kit,
              address: current.server.url.toString(),
              password,
              name: "second",
              now: f.now,
              fetcher: fetch,
            });

            expect(joined.vaultId).toBe(f.result.kit.vaultId);
          }

          expect(uploadRepair(f.first, token, f.now)).rejects.toThrow();
        } finally {
          await current.server.stop(true);
          current.stopPruning();
          current.storage.close();
          await f.close();
        }
      });

function expectFinished(result: Awaited<ReturnType<typeof finishRepair>>, mode: string) {
  expect(result.kind).toBe("finished");

  if (result.kind === "finished") expect(result.replaceKit).toBe(mode === "missing-envelope");
}
