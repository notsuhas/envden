import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "bun:test";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { deviceId } from "@envden/core/protocol";
import { deviceIdentity } from "../device.ts";

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
