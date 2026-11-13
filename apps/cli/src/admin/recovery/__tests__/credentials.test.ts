import { fixture } from "./fixture.ts";
import { test, expect, setSystemTime } from "bun:test";
import { kitJoin } from "../../../vault/recovery/kit.ts";
import { adminContext } from "../../shared/context.ts";
import { login } from "../../../session/login.ts";
import { rotateVault } from "../../devices/rotate.ts";
import { removeDevice } from "../../devices/remove.ts";
import { replaceKit, changePassword } from "../credentials.ts";
import { resetPassword } from "../reset.ts";

test("rotate and remove revoke the removed device", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");

    await kitJoin(second, {
      address: f.result.kit.server,
      name: "second",
      ...f.result.kit,
      password: "old password",
      now: f.now,
      fetcher: fetch,
    });

    await rotateVault(f.first, "old password", f.now);

    expect((await removeDevice(f.first, "second", "old password", f.now)).recommendNewKit).toBe(
      true,
    );

    const removed = await adminContext(second, f.now);
    expect(removed.client.request("/v1/head")).rejects.toThrow();
    expect(removeDevice(f.first, "first", "old password", f.now)).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test("replace kit invalidates old kit and allows new kit", async () => {
  const f = await fixture();

  try {
    const kit = await replaceKit(f.first, "old password", f.now);
    expect(f.joinHome("old-kit")).rejects.toThrow();

    const joined = await kitJoin(f.home("new-kit"), {
      address: kit.server,
      ...kit,
      name: "new-kit",
      password: "old password",
      now: f.now,
      fetcher: fetch,
    });

    expect(joined.vaultId).toBe(kit.vaultId);
  } finally {
    await f.close();
  }
});

test("password change replaces login while preserving the kit", async () => {
  const f = await fixture();

  try {
    await changePassword(f.first, "old password", "new password", f.result.kit.secretKey, f.now);
    const c = await adminContext(f.first, f.now);
    expect(login(c.client, c.vaultId, "old password")).rejects.toThrow();
    await login(c.client, c.vaultId, "new password");
    await f.joinHome("new-password", f.result.kit, "new password");
  } finally {
    await f.close();
  }
});

test("stale locked device resets with the same secret key", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");

    await kitJoin(second, {
      address: f.result.kit.server,
      ...f.result.kit,
      name: "second",
      password: "old password",
      now: f.now,
      fetcher: fetch,
    });

    await rotateVault(f.first, "old password", f.now);
    const later = () => f.now() + 31 * 86400000;
    setSystemTime(later());
    await resetPassword(second, "reset password", f.result.kit.secretKey, later);

    await kitJoin(f.home("reset-kit"), {
      address: f.result.kit.server,
      ...f.result.kit,
      name: "reset-kit",
      password: "reset password",
      now: later,
      fetcher: fetch,
    });
  } finally {
    await f.close();
  }
});
