import { isToken } from "@envden/core/protocol";
import { loadState } from "../../state/store/repository.ts";
import { expect, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testNetwork } from "@envden/server/testing";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { setupVault } from "../setup.ts";

const fixtureClock = () => 1800000000000;

export async function setupFlow() {
  const root = await mkdtemp(join(tmpdir(), "envden-cli-flow-"));
  const now = fixtureClock;
  const log = spyOn(console, "log").mockImplementation(() => {});
  const { serve, fetcher } = testNetwork();
  const running = await serve({ dataDir: join(root, "server"), port: 0, now });

  const token = log.mock.calls.flat().find((value) => isToken("setup", value));

  log.mockRestore();

  const cleanup = async () => {
    await running.shutdown();
    await rm(root, { recursive: true, force: true });
  };

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");

    const homes = ["first", "second"].map((name) =>
      createAdapters(
        {
          fetcher,
          home: join(root, name),
          userHome: join(root, name),
          keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
        },
        now,
      ),
    );

    const first = homes[0]!;
    const second = homes[1]!;
    const address = running.server.url.toString();

    let loseResponse = true;
    const codes: string[] = [];

    const options = {
      address,
      token,
      name: "first",
      now,
      onCode: async (code: string) => {
        codes.push(code);
      },
      fetcher: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const response = await fetcher(input, init);

        if (
          loseResponse &&
          (input instanceof Request ? input.url : input.toString()).endsWith("/v1/vault")
        ) {
          loseResponse = false;
          throw new Error("Lost creation response");
        }

        return response;
      },
    };

    let failed = false;

    try {
      await setupVault(first, options);
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
    expect(codes).toEqual([]);
    const pending = await loadState(first.home);
    if (!pending?.creationPending) throw new Error("Missing creation request");

    const result = await setupVault(first, { ...options, fetcher });

    expect(result.state.creationPending).toBeUndefined();
    expect(codes).toHaveLength(1);
    const code = codes[0]!;

    return { now, fetcher, first, second, address, token, result, code, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
