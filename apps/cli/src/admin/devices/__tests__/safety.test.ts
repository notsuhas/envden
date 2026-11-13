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
      fetcher: fetch,
    });

    let asked = false;

    await removeDevice(second, "first", "old password", f.now, fetch, false, async () => {
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
