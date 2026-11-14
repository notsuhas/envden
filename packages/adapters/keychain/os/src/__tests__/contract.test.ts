import { beforeEach, afterEach, spyOn as secretSpy } from "bun:test";
import { keychainContract } from "@envden/testing/keychain";
import { createOsKeychainAdapter } from "../index.ts";

keychainContract("OS keychain file fallback", (home) =>
  createOsKeychainAdapter({ home, fileOnly: true }),
);

let restoreDelete: (() => void) | undefined;

beforeEach(() => {
  if (process.env.ENVDEN_TEST_KEYCHAIN === "1") return;
  const remove = secretSpy(Bun.secrets, "delete").mockResolvedValue(true);
  restoreDelete = () => remove.mockRestore();
});

afterEach(() => {
  restoreDelete?.();
});
