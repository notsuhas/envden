import { isToken } from "@envden/core/protocol";
import { expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { loadState } from "../../../state/store/repository.ts";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { moveServer } from "../run.ts";
import { switchServer } from "../switch.ts";

test("switch after a move follows the signed move with no login at the destination", async () => {
  const f = await fixture(["second"]);
  const log = spyOn(console, "log").mockImplementation(() => {});
  const destination = await f.serve({ dataDir: join(f.root, "destination"), port: 0 });
  const token = log.mock.calls.flat().find((value) => isToken("setup", value));

  log.mockRestore();

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");
    const address = destination.server.url.toString();

    await moveServer(f.first, { address, token, now: f.now, fetcher: f.fetcher });
    await f.running.shutdown();

    const second = f.joined.second!;
    await switchServer(second, address, f.now, f.fetcher);

    expect((await loadState(second.home))?.server?.address).toBe(address);
  } finally {
    await destination.shutdown();
    await f.close();
  }
});
