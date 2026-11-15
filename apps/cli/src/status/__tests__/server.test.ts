import { test, expect } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { localStatus } from "../local.ts";
import { serverReachability } from "../reachability.ts";

test("status says unreachable only when the transport cannot reach the server", async () => {
  const f = await fixture();

  try {
    expect((await localStatus(f.first)).server).toBe("reachable");

    const offline = await localStatus(f.first, false, async () => {
      throw Object.assign(new TypeError("offline"), { code: "ConnectionRefused" });
    });

    expect(offline).toMatchObject({ server: "unreachable", serverReason: "connection refused" });

    for (const status of [403, 500])
      expect(
        await localStatus(f.first, false, async () => new Response("bad hello", { status })),
      ).toMatchObject({ server: "error", serverReason: expect.stringContaining("envden") });
  } finally {
    await f.close();
  }
});

test("server reachability names the transport failure or the server's refusal", () => {
  const unreachable = (cause: unknown) =>
    serverReachability(new EnvdenError("SERVER_UNREACHABLE", "Server unreachable", { cause }));

  const coded = (code: string) => Object.assign(new Error("transport"), { code });

  expect(unreachable(new DOMException("slow", "TimeoutError")).reason).toBe("timed out");
  expect(unreachable(coded("ENOTFOUND")).reason).toBe("address not found");
  expect(unreachable(coded("CERT_HAS_EXPIRED")).reason).toBe("TLS certificate rejected");
  expect(unreachable("odd").reason).toBe("network error");

  expect(serverReachability(new EnvdenError("SERVER_TOO_OLD", "Update the server"))).toEqual({
    server: "error",
    reason: "Update the server",
  });

  expect(serverReachability(new Error("raw"))).toEqual({
    server: "error",
    reason: "unexpected error",
  });
});
