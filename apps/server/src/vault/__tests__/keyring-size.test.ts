import { test, expect } from "bun:test";
import { vaultFixture } from "../../__tests__/vault-fixture.ts";
import { sealKeyring } from "@envden/core/protocol";
import { storedSwap } from "../material.ts";

test("keyring uploads cannot exceed the protocol epoch history size", async () => {
  const f = await vaultFixture();

  try {
    for (const epoch of [1, 2, 65]) {
      const valid = f.next(f.create.header, { op: 6, epoch }, []);

      valid.keyring = sealKeyring(
        {
          vaultId: f.vaultId,
          epoch,
          idKey: new Uint8Array(32),
          older: Array.from({ length: epoch - 1 }, (_, i) => ({
            epoch: i + 1,
            key: new Uint8Array(32),
          })),
        },
        new Uint8Array(32),
      );

      expect(() => storedSwap(valid, new Uint8Array(32))).not.toThrow();
      valid.keyring = new Uint8Array(valid.keyring.length + 1);
      expect(() => storedSwap(valid, new Uint8Array(32))).toThrow();
    }

    const swap = f.next(f.create.header, { op: 6, epoch: 2 }, []);
    swap.keyring = new Uint8Array(1024 * 1024);
    expect(() => storedSwap(swap, new Uint8Array(32))).toThrow();
  } finally {
    f.close();
  }
});
