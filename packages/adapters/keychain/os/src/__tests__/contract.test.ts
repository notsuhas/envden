import { keychainContract } from "@envden/testing/keychain";
import { createOsKeychainAdapter } from "../index.ts";

keychainContract("OS keychain file fallback", (home) =>
  createOsKeychainAdapter({ home, fileOnly: true }),
);
