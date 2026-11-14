import { fixture } from "./fixture.ts";
import * as protocol from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { test, expect, spyOn } from "bun:test";
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
      fetcher: f.fetcher,
    });

    await rotateVault(f.first, "old password", f.now);

    expect((await removeDevice(f.first, "second", "old password", f.now)).recommendNewKit).toBe(
      true,
    );

    const removed = await adminContext(second, f.now);

    await Promise.resolve(
      expect(removed.client.request("/v1/head")).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );

    await Promise.resolve(
      expect(removeDevice(f.first, "first", "old password", f.now)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );
  } finally {
    await f.close();
  }
});

test("replace kit invalidates old kit and allows new kit", async () => {
  const f = await fixture();

  try {
    const kit = await replaceKit(f.first, "old password", f.now);

    await Promise.resolve(
      expect(f.joinHome("old-kit")).rejects.toMatchObject({ code: "INVALID_DATA" }),
    );

    const joined = await kitJoin(f.home("new-kit"), {
      address: kit.server,
      ...kit,
      name: "new-kit",
      password: "old password",
      now: f.now,
      fetcher: f.fetcher,
    });

    expect(joined.vaultId).toBe(kit.vaultId);
    const future = new EnvdenError("UPDATE_REQUIRED", "Future envelope");
    const open = spyOn(protocol, "openEnvelope").mockRejectedValue(future);

    try {
      await Promise.resolve(
        expect(
          kitJoin(f.home("future"), {
            address: kit.server,
            ...kit,
            name: "future",
            password: "old password",
            now: f.now,
            fetcher: f.fetcher,
          }),
        ).rejects.toBe(future),
      );
    } finally {
      open.mockRestore();
    }
  } finally {
    await f.close();
  }
});

test("password change replaces login while preserving the kit", async () => {
  const f = await fixture();

  try {
    await changePassword(f.first, "old password", "new password", f.result.kit.secretKey, f.now);
    const c = await adminContext(f.first, f.now);

    await Promise.resolve(
      expect(login(c.client, c.vaultId, "old password")).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      }),
    );

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
      fetcher: f.fetcher,
    });

    await rotateVault(f.first, "old password", f.now);
    const laterTime = f.now() + 31 * 86400000;
    const later = () => laterTime;
    f.advance(31 * 86400000);
    await resetPassword(second, "reset password", f.result.kit.secretKey, later);

    await kitJoin(f.home("reset-kit"), {
      address: f.result.kit.server,
      ...f.result.kit,
      name: "reset-kit",
      password: "reset password",
      now: later,
      fetcher: f.fetcher,
    });
  } finally {
    await f.close();
  }
});

test("kit join resumes after its swap commits but key storage fails", async () => {
  const f = await fixture();

  try {
    const home = f.home("crashed-kit");
    const set = home.keychain.set.bind(home.keychain);
    let interrupted = false;

    home.keychain.set = async (slot, value) => {
      if (!interrupted && slot.endsWith("/epoch/1")) {
        interrupted = true;
        throw new Error("injected storage failure");
      }

      await set(slot, value);
    };

    const options = {
      ...f.result.kit,
      address: f.result.kit.server,
      password: "old password",
      name: "crashed-kit",
      now: f.now,
      fetcher: f.fetcher,
    };

    await Promise.resolve(expect(kitJoin(home, options)).rejects.toThrow());
    expect(interrupted).toBe(true);
    expect((await kitJoin(home, options)).vaultId).toBe(f.result.kit.vaultId);
  } finally {
    await f.close();
  }
});
