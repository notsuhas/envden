import { expect, test } from "bun:test";
import { statusBody } from "../normalize/status.ts";

const status = {
  version: "0.3.8",
  uptimeSeconds: 9,
  mode: "normal",
  vaults: 1,
  storageBytes: 12345,
  fullestVault: "below-50",
  lastPrune: null,
} as const;

test("status observations compare fields across uptime digit boundaries", () => {
  expect(JSON.stringify(status).length).not.toBe(
    JSON.stringify({ ...status, uptimeSeconds: 10 }).length,
  );

  expect(statusBody(status)).toEqual({ ...status, uptimeSeconds: "<DURATION>" });
  expect(statusBody({ ...status, uptimeSeconds: 10 })).toEqual(statusBody(status));

  for (const change of [
    { version: "0.3.9" },
    { mode: "moved" },
    { vaults: 2 },
    { storageBytes: 12346 },
    { fullestVault: "50-80" },
    { lastPrune: { at: "2026-11-17T03:00:00.000Z", ok: false } },
  ])
    expect(statusBody({ ...status, ...change })).not.toEqual(statusBody(status));

  for (const uptimeSeconds of [-1, 0.5, "10", null])
    expect(() => statusBody({ ...status, uptimeSeconds })).toThrow();

  expect(() => statusBody({ ...status, unexpected: true })).toThrow();
});
