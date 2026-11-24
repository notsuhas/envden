import { test, expect, spyOn } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as p from "@envden/core/protocol";
import { loadServerKeys } from "../identity/keys.ts";
import { initializeSetup, reissueSetup } from "../identity/setup.ts";
import { localSetupToken } from "../identity/local.ts";
import { fixture, identity } from "./fixture.ts";

test("server signing key persists privately", async () => {
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

test("the identity folder and key are restricted with the shared permissions helper", async () => {
  const processes = await import("@envden/core/process");
  const restricted: [string, boolean | undefined][] = [];

  const restrict = spyOn(processes, "restrictAccess").mockImplementation(
    async (path, directory) => {
      restricted.push([path, directory]);
    },
  );

  const dir = mkdtempSync(join(tmpdir(), "envden-identity-permissions-"));

  try {
    await loadServerKeys(dir);
    await loadServerKeys(dir);
    expect(restricted).toContainEqual([dir, true]);
    expect(restricted).toContainEqual([join(dir, "identity.json"), false]);
  } finally {
    restrict.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a local host gets a fresh setup token until a vault exists", async () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-local-"));

  try {
    const first = (await localSetupToken(dir, 1))!;
    const second = (await localSetupToken(dir, 2))!;

    expect(p.isToken("setup", first)).toBe(true);
    expect(second).not.toBe(first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup initialization preserves active hash, replaces explicitly, and stays consumed", async () => {
  const f = fixture(identity());

  try {
    const pub = f.options.serverKeys.publicKey;
    const firstToken = p.encodeToken("setup", p.randomBytes(20), p.serverPin(pub));
    const first = initializeSetup(f.storage, pub, firstToken)!;
    const key = p.tokenKey("setup", p.decodeToken("setup", first).secret);
    expect(p.equal(f.storage.setupToken()!, key)).toBe(true);
    expect(initializeSetup(f.storage, pub)).toBeUndefined();
    const replacement = p.encodeToken("setup", p.randomBytes(20), p.serverPin(pub));
    expect(initializeSetup(f.storage, pub, replacement)).toBe(replacement);
    expect(p.equal(f.storage.setupToken()!, key)).toBe(false);
    expect(reissueSetup(f.storage, pub)).toBeUndefined();

    expect(() =>
      initializeSetup(f.storage, pub, p.encodeToken("setup", p.randomBytes(20), p.randomBytes(32))),
    ).toThrow();

    f.storage.configureVault(
      p.randomBytes(32),
      { active: true, frozen: false, proofRefused: false },
      [],
      f.storage.setupToken(),
    );

    expect(initializeSetup(f.storage, pub)).toBeUndefined();
    expect(initializeSetup(f.storage, pub)).toBeUndefined();
  } finally {
    f.close();
  }
});

test("discarding the only move session does not reissue setup on restart", async () => {
  const f = fixture(identity());

  try {
    const pub = f.options.serverKeys.publicKey;
    const token = p.encodeToken("setup", p.randomBytes(20), p.serverPin(pub));
    initializeSetup(f.storage, pub, token);

    for (const id of f.storage.vaultIds()) {
      f.storage.configureVault(id, { ...f.storage.vault(id)!, active: false });
      f.storage.discardInactiveVault(id);
    }

    const vault = p.randomBytes(32);

    f.storage.configureVault(
      vault,
      { active: false, frozen: false, proofRefused: false },
      [],
      f.storage.setupToken(),
    );

    f.storage.discardInactiveVault(vault);
    expect(initializeSetup(f.storage, pub)).toBeUndefined();
  } finally {
    f.close();
  }
});

test("identity publication syncs the file before publication and then the directory", async () => {
  const fs = await import("node:fs/promises");
  const { persistIdentity } = await import("../identity/persist.ts");
  const dir = mkdtempSync(join(tmpdir(), "envden-durable-identity-"));
  const events: string[] = [];

  try {
    await persistIdentity(dir, "{}", {
      ...fs,
      async open(path, flags, mode) {
        const file = await fs.open(path, flags, mode);
        const sync = file.sync.bind(file);

        file.sync = async () => {
          events.push(flags === "r" ? "directory" : "file");
          await sync();
        };

        return file;
      },
      async link(from, to) {
        events.push("publish");
        await fs.link(from, to);
      },
    });

    expect(events).toEqual(["file", "publish", "directory"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
