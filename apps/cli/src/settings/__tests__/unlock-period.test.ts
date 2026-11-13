import { test, expect } from "bun:test";
import { unlockPeriod } from "../unlock-period.ts";

test("unlock periods accept only the server policy values", () => {
  expect(["1d", "7d", "30d", "never"].map(unlockPeriod)).toEqual([
    86400000,
    604800000,
    2592000000,
    null,
  ]);

  expect(() => unlockPeriod("forever")).toThrow();
});

test("unlock-period reads the server policy through the shared wire schema", async () => {
  const { fixture } = await import("../../admin/recovery/__tests__/fixture.ts");
  const { getUnlockPeriod, setUnlockPeriod } = await import("../unlock-period.ts");
  const f = await fixture();

  try {
    await setUnlockPeriod(f.first, "7d", "old password", f.now);
    expect(await getUnlockPeriod(f.first, f.now)).toEqual({ period: 604800000 });
  } finally {
    await f.close();
  }
});
