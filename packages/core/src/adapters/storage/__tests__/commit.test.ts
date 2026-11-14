import { expect, test } from "bun:test";
import { prepareCommit } from "../commit.ts";
import type { IStorageAdapter, IStoredSwap } from "../../storage.ts";

const storage: Pick<
  IStorageAdapter,
  "setupToken" | "consumeSession" | "mailbox" | "configureVault" | "hasVault"
> = {
  setupToken: () => undefined,
  consumeSession: () => undefined,
  mailbox: () => undefined,
  configureVault: () => {},
  hasVault: () => false,
};

test("commit preconditions throw fixed EnvdenErrors", () => {
  for (const [extra, code, message] of [
    [{ setupTokenHash: new Uint8Array(32) }, "UNAUTHORIZED", "Setup token changed or consumed"],
    [
      { consumeSessions: [{ kind: "login", device: new Uint8Array(16), purpose: "test" }] },
      "UNAUTHORIZED",
      "Session expired or consumed",
    ],
    [{ closeMailbox: 1 }, "NOT_FOUND", "Mailbox expired or closed"],
    [{}, "INVALID_DATA", "Creation requires vault metadata"],
  ] satisfies [Partial<IStoredSwap>, string, string][]) {
    const swap: IStoredSwap = {
      header: { hash: new Uint8Array(32), bytes: new Uint8Array(), seq: 1n },
      entries: [],
      bodyDigest: new Uint8Array(32),
      ...extra,
    };

    try {
      prepareCommit(storage, new Uint8Array(32), swap, 0);
      throw new Error("commit unexpectedly succeeded");
    } catch (error) {
      expect(error).toMatchObject({ name: "EnvdenError", code, message });
    }
  }
});
