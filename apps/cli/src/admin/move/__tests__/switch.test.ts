import { isToken } from "@envden/core/protocol";
import { expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { login } from "../../../session/login.ts";
import { loadState } from "../../../state/store/repository.ts";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { moveServer } from "../run.ts";
import { switchServer } from "../switch.ts";

test("switch after a move unlocks at the destination, or asks for envden unlock without a terminal", async () => {
  const f = await fixture(["second"]);
  const log = spyOn(console, "log").mockImplementation(() => {});
  const destination = await f.serve({ dataDir: join(f.root, "destination"), port: 0 });
  const token = log.mock.calls.flat().find((value) => isToken("setup", value));

  log.mockRestore();

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");
    const address = destination.server.url.toString();
    const options = { address, token, password: "old password", now: f.now, fetcher: f.fetcher };

    await moveServer(f.first, options);
    await f.running.shutdown();

    const second = f.joined.second!;

    await Promise.resolve(
      expect(switchServer(second, address, f.now, f.fetcher)).rejects.toMatchObject({
        code: "LOCKED",
      }),
    );

    const logins: string[] = [];

    const fetcher: typeof f.fetcher = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.startsWith("/v1/opaque/login/")) logins.push(url.origin);

      return f.fetcher(input, init);
    };

    await switchServer(second, address, f.now, fetcher, (client, vaultId) =>
      login(client, vaultId, "old password"),
    );

    const state = await loadState(second.home);

    expect(new Set(logins)).toEqual(new Set([new URL(address).origin]));
    expect(state?.server?.address).toBe(address);
    expect(state?.session?.unlockedUntil).toBeGreaterThan(f.now());
  } finally {
    await destination.shutdown();
    await f.close();
  }
});
