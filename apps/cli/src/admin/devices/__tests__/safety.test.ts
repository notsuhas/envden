import { test, expect } from "bun:test";
import { kitJoin } from "../../../vault/recovery/kit.ts";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { adminContext } from "../../shared/context.ts";
import { currentHistory } from "../../shared/history.ts";
import { exposedNames } from "../exposure.ts";
import { removeDevice } from "../remove.ts";
import { listDevices } from "../list.ts";

test("device removal asks about recovery keys before committing", async () => {
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

    let asked = false;

    await removeDevice(second, "first", "old password", f.now, f.fetcher, false, async () => {
      asked = true;

      expect((await listDevices(second, f.now)).some((device) => device.name === "first")).toBe(
        true,
      );

      return false;
    });

    expect(asked).toBe(true);

    expect((await listDevices(second, f.now)).some((device) => device.name === "first")).toBe(
      false,
    );
  } finally {
    await f.close();
  }
});

test("exposure downloads identical historical file lists once", async () => {
  const f = await fixture();

  try {
    const context = await adminContext(f.first, f.now);
    const history = await currentHistory(context);
    history.headers.push(...history.headers);
    const original = context.client.request;
    let downloads = 0;

    context.client.request = (...args) => {
      if (args[0].startsWith("/v1/files/")) downloads++;

      return original(...args);
    };

    await exposedNames(context, history);
    expect(downloads).toBe(1);
  } finally {
    await f.close();
  }
});

test("unknown device does not ask for credentials and confirmation precedes removal", async () => {
  const f = await fixture();

  try {
    let passwords = 0;

    await Promise.resolve(
      expect(
        removeDevice(
          f.first,
          "missing",
          async () => {
            passwords++;

            return "old password";
          },
          f.now,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" }),
    );

    expect(passwords).toBe(0);
    const second = f.home("second");

    await kitJoin(second, {
      address: f.result.kit.server,
      name: "second",
      ...f.result.kit,
      password: "old password",
      now: f.now,
      fetcher: f.fetcher,
    });

    let confirmed = false;

    await Promise.resolve(
      expect(
        removeDevice(
          second,
          "first",
          async () => "old password",
          f.now,
          f.fetcher,
          false,
          undefined,
          async (exposure) => {
            confirmed = true;
            expect(exposure.files).toEqual([]);

            expect(
              (await listDevices(second, f.now)).some((device) => device.name === "first"),
            ).toBe(true);

            return false;
          },
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    expect(confirmed).toBe(true);
    expect((await listDevices(second, f.now)).some((device) => device.name === "first")).toBe(true);
  } finally {
    await f.close();
  }
});
