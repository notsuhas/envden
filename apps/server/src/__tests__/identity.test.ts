import { test, expect } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as p from "@envden/core/protocol";
import { loadServerKeys } from "../identity/keys.ts";
import { initializeSetup } from "../identity/setup.ts";
import { fixture, identity } from "./fixture.ts";

test("server signing key and OPAQUE setup persist privately", async () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-identity-"));

  try {
    const first = await loadServerKeys(dir);
    chmodSync(dir, 0o755);
    chmodSync(join(dir, "identity.json"), 0o644);
    const second = await loadServerKeys(dir);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(second).toEqual(first);
    expect(statSync(join(dir, "identity.json")).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup initialization preserves active hash, replaces explicitly, and stays consumed", async () => {
  const f = fixture(await identity());

  try {
    const pub = f.options.serverKeys.publicKey;
    const first = initializeSetup(f.storage, pub)!;
    const key = p.tokenKey("setup", p.decodeToken("setup", first).secret);
    expect(p.equal(f.storage.setupToken()!, key)).toBe(true);
    expect(initializeSetup(f.storage, pub)).toBeUndefined();
    const replacement = p.encodeToken("setup", p.randomBytes(20), p.serverPin(pub));
    expect(initializeSetup(f.storage, pub, replacement)).toBe(replacement);
    expect(p.equal(f.storage.setupToken()!, key)).toBe(false);

    expect(() =>
      initializeSetup(f.storage, pub, p.encodeToken("setup", p.randomBytes(20), p.randomBytes(32))),
    ).toThrow();

    f.storage.configureVault(
      p.randomBytes(32),
      { active: true, frozen: false, skRefused: false, unlockPeriod: null },
      [],
      f.storage.setupToken(),
    );

    expect(initializeSetup(f.storage, pub)).toBeString();
    expect(initializeSetup(f.storage, pub)).toBeUndefined();
  } finally {
    f.close();
  }
});
