import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteStorageAdapter } from "../index.ts";

test("login finish groups session consumption, device update and charge refund atomically", () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-login-"));
  const db = createSqliteStorageAdapter(dir, 0);
  const vault = new Uint8Array([1]);
  const device = new Uint8Array([2]);
  const key = { kind: "login", device, purpose: "unlock" } as const;

  try {
    db.configureVault(vault, { active: true, frozen: false, skRefused: false, unlockPeriod: null });
    db.putSession(vault, key, new Uint8Array([9]), 0);
    const charged = db.charge(vault, { kind: "member", device }, 0);
    if (charged.kind !== "charged") throw new Error("Expected charge");

    expect(() =>
      db.transaction(() => {
        db.consumeSession(vault, key, 1);
        db.putDevice(vault, device, { unlockedUntil: 100, freshUntil: 50, clientVersion: "1.0.0" });
        db.refund(charged.receipt, 1);
        throw new Error("Login rejected");
      }),
    ).toThrow("Login rejected");

    expect(db.session(vault, key, 1)).toBeDefined();
    expect(db.device(vault, device)).toBeUndefined();
    expect(db.refund(charged.receipt, 1)).toBe(true);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lockout doubles to a 24 hour cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-limits-"));
  const db = createSqliteStorageAdapter(dir, 0);

  try {
    let now = 0;

    for (let strike = 0; strike < 10; strike++) {
      for (let attempt = 0; attempt < 5; attempt++)
        expect(db.charge(new Uint8Array([1]), { kind: "non-member" }, now).kind).toBe("charged");

      const duration = Math.min(86400000, 900000 * 2 ** strike);

      expect(db.charge(new Uint8Array([1]), { kind: "non-member" }, now + 1)).toEqual({
        kind: "locked",
        until: now + duration,
      });

      now += duration;
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
