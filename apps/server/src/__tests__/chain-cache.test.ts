import { expect, spyOn, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { vaultChain } from "../vault/chain.ts";
import { storedSwap } from "../vault/material.ts";

test("manifest-only changes reuse the verified device list", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    const entries = spyOn(f.storage, "entries");
    const first = vaultChain(f.storage, f.vaultId);
    const next = f.next(f.create.header, { op: 8 });
    const stored = storedSwap(next, p.randomBytes(32));
    f.storage.commitSwap(f.vaultId, next.expectedHead, stored, f.options.now());
    const second = vaultChain(f.storage, f.vaultId);
    expect(second.header.body.seq).toBe(2n);
    expect(second.state).toBe(first.state);
    expect(entries).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});
