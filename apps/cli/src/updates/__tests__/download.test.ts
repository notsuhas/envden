import { test, expect } from "bun:test";
import { sha256 } from "@envden/core/protocol";
import { downloadUpdate } from "../self/download.ts";
import { RELEASE_REPOSITORY } from "../github.ts";
import type { TFetch } from "../../client/fetch.ts";

for (const scenario of ["valid", "mismatch", "missing", "equal", "older"]) {
  test(`download update: ${scenario}`, async () => {
    const bytes = new TextEncoder().encode("binary");
    const calls: string[] = [];

    const fetcher: TFetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push(url);

      if (url.endsWith("/latest"))
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://github.com/${RELEASE_REPOSITORY}/releases/tag/v1.0.0`,
          },
        });

      if (url.endsWith("SHA256SUMS"))
        return new Response(
          `${Buffer.from(sha256(bytes)).toString("hex")}  envden-${scenario === "missing" ? "darwin-arm64" : "linux-x64"}`,
        );

      return new Response(scenario === "mismatch" ? "wrong" : bytes);
    };

    const action = downloadUpdate(
      fetcher,
      scenario === "equal" ? "1.0.0" : scenario === "older" ? "2.0.0" : "0.0.0",
      "linux-x64",
    );

    if (scenario === "valid") {
      expect(await action).toEqual(bytes);

      expect(calls.slice(1)).toEqual(
        ["SHA256SUMS", "envden-linux-x64"].map(
          (name) => `https://github.com/${RELEASE_REPOSITORY}/releases/download/v1.0.0/${name}`,
        ),
      );
    } else if (scenario === "equal" || scenario === "older") {
      expect(await action).toEqual({ kind: "current" });
    } else
      await Promise.resolve(
        expect(action).rejects.toThrow(
          scenario === "mismatch" ? "checksum mismatch" : "No release build",
        ),
      );

    if (scenario === "equal" || scenario === "older") expect(calls.length).toBe(1);
  });
}

test("large downloads use an injectable total deadline longer than thirty seconds", async () => {
  const { spyOn } = await import("bun:test");

  const timeout = spyOn(AbortSignal, "timeout").mockImplementation(
    () => new AbortController().signal,
  );

  const bytes = new TextEncoder().encode("binary");

  try {
    await downloadUpdate(
      async (input) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.endsWith("latest")) return Response.json({ tag_name: "v99.0.0" });

        if (url.endsWith("SHA256SUMS"))
          return new Response(`${Buffer.from(sha256(bytes)).toString("hex")}  envden-linux-x64`);

        return new Response(bytes);
      },
      "0.0.0",
      "linux-x64",
      1800000,
    );

    expect(timeout.mock.calls.filter(([ms]) => ms === 1800000)).toHaveLength(2);
  } finally {
    timeout.mockRestore();
  }
});
