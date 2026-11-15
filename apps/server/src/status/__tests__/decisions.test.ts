import { expect, test } from "bun:test";
import { VAULT_QUOTA_BYTES, type IStoredVault } from "@envden/core/adapters";
import { deriveQuotaBand } from "../band.ts";
import { admitRequest } from "../limit.ts";
import { deriveServerMode } from "../mode.ts";
import { createStatusState } from "../state.ts";

const vault: IStoredVault = { active: true, frozen: false, skRefused: false, unlockPeriod: null };
const moved = { ...vault, serverMoved: new Uint8Array(32) };

const restored = {
  ...vault,
  restored: { repairTokenHash: new Uint8Array(32), restoredHead: new Uint8Array(32) },
};

test("server mode", () => {
  expect(deriveServerMode([])).toBe("normal");
  expect(deriveServerMode([vault, moved])).toBe("normal");
  expect(deriveServerMode([moved, moved])).toBe("moved");
  expect(deriveServerMode([moved, restored])).toBe("restored");
});

test("quota band follows the fullest vault", () => {
  const quota = VAULT_QUOTA_BYTES;

  expect(quota).toBe(2 ** 30);
  expect(deriveQuotaBand([])).toBeNull();
  expect(deriveQuotaBand([0, quota * 0.49])).toBe("below-50");
  expect(deriveQuotaBand([quota * 0.5, 0])).toBe("50-80");
  expect(deriveQuotaBand([quota * 0.8])).toBe("80-95");
  expect(deriveQuotaBand([quota * 0.95 - 1])).toBe("80-95");
  expect(deriveQuotaBand([quota * 2])).toBe("95-plus");
});

test("sixty requests per minute", () => {
  let window: { start: number; count: number } | undefined = { start: -Infinity, count: 0 };

  for (let i = 0; i < 60; i++) window = admitRequest(window!, 1000);
  expect(admitRequest(window!, 60999)).toBeUndefined();
  expect(admitRequest(window!, 61000)).toEqual({ start: 61000, count: 1 });
});

test("only ENVDEN_STATUS_PAGE=off disables the page", () => {
  expect(createStatusState(5, {})).toEqual({ enabled: true, startedAt: 5 });
  expect(createStatusState(5, { ENVDEN_STATUS_PAGE: "on" }).enabled).toBe(true);
  expect(createStatusState(5, { ENVDEN_STATUS_PAGE: "off" }).enabled).toBe(false);
});
