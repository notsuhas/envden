import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { runVaultAdmin } from "../../commands/vault/run.ts";
import { createAdapters } from "../../adapters.ts";
import { test, expect, spyOn } from "bun:test";
import { confirmedPassword } from "../password.ts";

const fixtureClock = () => 1800000000000;

test("master password needs a matching second entry, re-asking both in a terminal", async () => {
  const entries = (...values: string[]) => {
    const labels: string[] = [];

    const prompt = async (label: string) => {
      labels.push(label);

      return values.shift()!;
    };

    return { labels, prompt };
  };

  const same = entries("same", "same");
  expect(await confirmedPassword(same.prompt, 1)).toBe("same");
  expect(same.labels).toEqual(["Master password", "Confirm master password"]);

  const retried = entries("first", "second", "fixed", "fixed");
  const log = spyOn(console, "error").mockImplementation(() => {});

  try {
    expect(await confirmedPassword(retried.prompt, 3)).toBe("fixed");
    expect(retried.labels).toHaveLength(4);

    await Promise.resolve(
      expect(confirmedPassword(entries("a", "b", "c", "d").prompt, 2)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );

    await Promise.resolve(
      expect(confirmedPassword(entries("a", "b").prompt, 1)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );
  } finally {
    log.mockRestore();
  }
});

test("setup reports the network problem before collecting secrets", async () => {
  const { createAdapters } = await import("../../adapters.ts");
  const { runSetup } = await import("../setup.ts");
  const { createMemoryKeychainAdapter } = await import("@envden/testing/keychain");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "envden-https-"));

  try {
    const adapters = createAdapters(
      {
        home: root,
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    adapters.network.checkHttpsCertificate = async () => ({
      kind: "logged-out",
      message: "Log in first",
    });

    await Promise.resolve(expect(runSetup(adapters, {}, () => 1)).rejects.toThrow("Log in first"));
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
          createAdapters(
            {
              home: "/unused",
              userHome: "/unused",
              keychain: createMemoryKeychainAdapter([]),
            },
            fixtureClock,
          ),
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
