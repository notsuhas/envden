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

    await Promise.resolve(
      expect(
        localStatus(f.first, false, async () => new Response("bad hello", { status: 403 })),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );
  } finally {
    await f.close();
  }
});
