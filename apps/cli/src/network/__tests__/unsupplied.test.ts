import { expect, test } from "bun:test";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";

// tests inject adapters; they must never reach the real tailnet through a forgotten network adapter
test("injected adapters without a network adapter refuse every network call", async () => {
  const adapters = createAdapters(
    { home: "/tmp/envden-unsupplied", userHome: "/tmp", keychain: createMemoryKeychainAdapter([]) },
    () => 0,
  );

  for (const call of [
    () => adapters.network.status(),
    () => adapters.network.checkHttpsCertificate(),
    () => adapters.network.expose(4783),
  ])
    await Promise.resolve(expect(call()).rejects.toThrow("No network adapter was supplied"));
});
