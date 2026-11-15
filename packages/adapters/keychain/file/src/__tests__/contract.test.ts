import { keychainContract } from "@envden/testing/keychain";
import { createFileKeychainAdapter } from "../index.ts";

keychainContract("file keychain", (home) => createFileKeychainAdapter({ home }));
