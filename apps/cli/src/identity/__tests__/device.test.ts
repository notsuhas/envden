import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "bun:test";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { deviceId } from "@envden/core/protocol";
import { deviceIdentity } from "../device.ts";

const fixtureClock = () => 1800000000000;

test("three independent keypairs survive reload in their namespace", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-identity-"));

  try {
    const keychain = createMemoryKeychainAdapter(["get", "set"]);
    const first = await deviceIdentity(keychain, join(root, "first"), "laptop");
    expect(await deviceIdentity(keychain, join(root, "first"), "ignored rename")).toEqual(first);
    expect(first.record.id).toEqual(deviceId(first.record));
    expect(first.keys.encSk).not.toEqual(first.keys.objSk);
    expect(first.keys.reqSk).not.toEqual(first.keys.objSk);

    expect((await deviceIdentity(keychain, join(root, "second"), "other")).record.id).not.toEqual(
      first.record.id,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a fresh join replaces an orphan's keys and honours the requested name", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-orphan-"));

  try {
    const keychain = createMemoryKeychainAdapter(["get", "set"]);
    const old = await deviceIdentity(keychain, root, "old");
    const next = await deviceIdentity(keychain, root, "new", true);
    expect(next.record.id).not.toEqual(old.record.id);
    expect(next.record.name).toBe("new");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("configured state cannot silently replace a missing identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-configured-"));

  try {
    const { saveState } = await import("../../state/store/repository.ts");
    const { emptyState } = await import("../../state/model.ts");
    await saveState(root, { ...emptyState("joined"), vaultId: "configured" }, fixtureClock);
    const keychain = createMemoryKeychainAdapter(["get"]);

    await Promise.resolve(
      expect(deviceIdentity(keychain, root, "replacement")).rejects.toMatchObject({
        code: "LOCKED",
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
