import { expect, spyOn, test } from "bun:test";
import { printKit } from "../kit.ts";

const kit = { vaultId: "VAULT", secretKey: "SECRET", server: "https://envden.example" };

for (const savedTo of [undefined, "/tmp/kit.json"])
  test(`kit block labels each field, saved to ${savedTo}`, () => {
    const log = spyOn(console, "log").mockImplementation(() => {});

    try {
      printKit(kit, savedTo);
      const text = String(log.mock.calls[0]?.[0]);

      expect(text).toContain("like a passport");
      expect(text).toContain("  Vault ID:    VAULT");
      expect(text).toContain("  Server:      https://envden.example");

      if (savedTo) {
        expect(text).toContain(`  Saved to:    ${savedTo}`);
        expect(text).not.toContain("SECRET");
      } else expect(text).toContain("  Secret key:  SECRET");
    } finally {
      log.mockRestore();
    }
  });
