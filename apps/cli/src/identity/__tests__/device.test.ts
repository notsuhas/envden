import { test, expect } from "bun:test";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { deviceId } from "@envden/core/protocol";
import { deviceIdentity } from "../device.ts";

test("three independent keypairs survive reload in their namespace", async () => {
  const keychain = createMemoryKeychainAdapter(["get", "set"]);
  const first = await deviceIdentity(keychain, "first", "laptop");
  expect(await deviceIdentity(keychain, "first", "ignored rename")).toEqual(first);
  expect(first.record.id).toEqual(deviceId(first.record));
  expect(first.keys.encSk).not.toEqual(first.keys.objSk);
  expect(first.keys.reqSk).not.toEqual(first.keys.objSk);

  expect((await deviceIdentity(keychain, "second", "other")).record.id).not.toEqual(
    first.record.id,
  );
});
