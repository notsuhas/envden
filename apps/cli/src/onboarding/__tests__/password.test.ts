import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { runVaultAdmin } from "../../commands/vault/run.ts";
import { createAdapters } from "../../adapters.ts";
import { test, expect } from "bun:test";
import { confirmedPassword } from "../password.ts";

test("master password needs a matching second entry", async () => {
  let prompts = 0;

  expect(
    await confirmedPassword(async () => {
      prompts++;

      return "same";
    }),
  ).toBe("same");

  expect(prompts).toBe(2);
  let first = true;

  expect(
    confirmedPassword(async () => {
      if (first) {
        first = false;

        return "first";
      }

      return "second";
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("setup checks Tailscale HTTPS before collecting secrets", async () => {
  const { createAdapters } = await import("../../adapters.ts");
  const { runSetup } = await import("../setup.ts");
  const { createMemoryKeychainAdapter } = await import("@envden/testing/keychain");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "envden-https-"));

  try {
    const adapters = createAdapters({
      home: root,
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    });

    adapters.network.checkHttpsCertificate = async () => false;

    await Promise.resolve(
      expect(runSetup(adapters, {}, () => 1)).rejects.toThrow("Enable Tailscale HTTPS"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const action of ["change", "reset"] as const)
  test(`vault password ${action} rejects mismatched confirmation before accessing vault`, async () => {
    const labels: string[] = [];

    await Promise.resolve(
      expect(
        runVaultAdmin(
          createAdapters({
            home: "/unused",
            userHome: "/unused",
            keychain: createMemoryKeychainAdapter([]),
          }),
          action,
          () => 0,
          async (label) => {
            labels.push(label);

            return label.startsWith("Confirm") ? "different" : "password";
          },
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    expect(labels).toContain("Confirm master password");
    expect(labels).not.toContain("Recovery secret key");
  });
