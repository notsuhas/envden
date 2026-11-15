import { checkCrash, checkRestorePoint } from "./crash.ts";
import * as p from "@envden/core/protocol";
import { changePassword } from "../../recovery/credentials.ts";
import { kitRejoin } from "../../rejoin/kit.ts";
import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { kitJoin } from "../../../vault/recovery/kit.ts";
import { rotateVault } from "../../devices/rotate.ts";
import { uploadRepair } from "../upload.ts";
import { finishRepair } from "../finish.ts";
import { saveState, loadState } from "../../../state/store/repository.ts";

const fixtureClock = () => 1800000000000;

for (const [mode, crash, drop] of [
  ["rotate", "none", false],
  ["rotate", "before-close", true],
  ["password", "after-close", false],
  ["password", "adoption", true],
  ["missing-envelope", "none", true],
  ["missing-envelope", "before-close", false],
  ["missing-envelope", "after-close", true],
  ["missing-envelope", "adoption", false],
] as const)
  test(`restore repair ${mode} ${crash} ${drop ? "drops an unreported member" : "combines two device reports"}`, async () => {
    const f = await fixture();
    const second = f.home("second");

    await kitJoin(second, {
      ...f.result.kit,
      address: f.result.kit.server,
      password: "old password",
      name: "second",
      now: f.now,
      fetcher: f.fetcher,
    });

    await f.running.shutdown();
    await cp(join(f.root, "server"), join(f.root, "backup"), { recursive: true });
    let current = await f.serve({ dataDir: join(f.root, "server"), port: 0, now: f.now });

    const point = async (home: typeof f.first, address: string) => {
      const state = await loadState(home.home);
      if (!state?.server) throw new Error("Missing server");
      state.server.address = address;
      await saveState(home.home, state, fixtureClock);
    };

    await point(f.first, current.server.url.toString());

    if (mode === "password")
      await changePassword(f.first, "old password", "new password", f.result.kit.secretKey, f.now);
    else await rotateVault(f.first, "old password", f.now);

    await current.shutdown();
    const log = spyOn(console, "log").mockImplementation(() => {});

    current = await f.serve({
      dataDir: join(f.root, "backup"),
      port: 0,
      now: f.now,
      restored: true,
    });

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
        fetcher: f.fetcher,
      };

      await checkRestorePoint(f.first, options, mode, crash);

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
          fetcher: f.fetcher,
        });

        expect(joined.vaultId).toBe(f.result.kit.vaultId);
      }

      await Promise.resolve(
        expect(uploadRepair(f.first, token, f.now)).rejects.toMatchObject({
          code: "INVALID_DATA",
        }),
      );
    } finally {
      await current.shutdown();
      await f.close();
    }
  });

function expectFinished(result: Awaited<ReturnType<typeof finishRepair>>, mode: string) {
  expect(result.kind).toBe("finished");

  if (result.kind === "finished") expect(result.replaceKit).toBe(mode === "missing-envelope");
}
