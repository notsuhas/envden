import { expect, test } from "bun:test";
import { fixture, identity, vaultId } from "./fixture.ts";
import { readRange } from "../vault/reads/history.ts";

for (const [count, size, expected] of [
  [105, 10, 100],
  [4, 400000, 1],
] as const)
  test(`history limits ${count} rows of ${size} bytes`, async () => {
    const f = fixture(identity());

    try {
      let head = f.storage.head(vaultId);

      for (let index = 1; index <= count!; index++) {
        const hash = new Uint8Array(32).fill(index);

        f.storage.commitSwap(
          vaultId,
          head,
          {
            header: { hash, bytes: new Uint8Array(size), seq: BigInt(index + 1) },
            entries: [],
            bodyDigest: hash,
          },
          f.options.now(),
        );

        head = hash;
      }

      const auth = { request: f.request("/v1/headers").r, member: true };
      const page = readRange(f.options, auth, "headers", "2", undefined);
      expect(page.objects.length).toBe(expected!);
      const next = readRange(f.options, auth, "headers", String(expected! + 2), undefined);
      expect(next.objects.length).toBeGreaterThan(0);
    } finally {
      f.close();
    }
  });
