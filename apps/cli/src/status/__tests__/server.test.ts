import { test, expect } from "bun:test";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { localStatus } from "../local.ts";

test("status says unknown only when the transport cannot reach the server", async () => {
  const f = await fixture();

  try {
    expect((await localStatus(f.first)).server).toBe("reachable");

    expect(
      (
        await localStatus(f.first, false, async () => {
          throw new Error("offline");
        })
      ).server,
    ).toBe("unknown");

    for (const status of [403, 500])
      expect(
        (await localStatus(f.first, false, async () => new Response("bad hello", { status })))
          .server,
      ).toBe("error");
  } finally {
    await f.close();
  }
});
