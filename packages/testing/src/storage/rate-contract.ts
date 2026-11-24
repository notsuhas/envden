import { expect } from "bun:test";
import type { IStorageAdapter } from "@envden/core/adapters";

export function rateLimitContract(db: IStorageAdapter) {
  const b = (value: number) => new Uint8Array([value]);
  const bucket = { kind: "recovery" } as const;
  for (let i = 0; i < 5; i++) expect(db.charge(b(1), bucket, 0).kind).toBe("charged");
  expect(db.charge(b(1), bucket, 1)).toEqual({ kind: "locked", until: 900000 });
  expect(db.charge(b(2), bucket, 1).kind).toBe("charged");
  for (let i = 0; i < 5; i++) db.charge(b(1), bucket, 900000);
  expect(db.charge(b(1), bucket, 900001)).toEqual({ kind: "locked", until: 2700000 });
  for (let i = 0; i < 5; i++) db.charge(b(3), bucket, 0);
  const decayed = 900000 + 86400000 + 1;
  for (let i = 0; i < 5; i++) db.charge(b(3), bucket, decayed);

  expect(db.charge(b(3), bucket, decayed + 1)).toEqual({
    kind: "locked",
    until: decayed + 900000,
  });

  const charge = db.charge(b(4), { kind: "join" }, 0);
  if (charge.kind !== "charged") throw new Error("Expected charge");
  expect(db.refund(charge.receipt, 1)).toBe(true);
  expect(db.refund(charge.receipt, 1)).toBe(false);

  const struck = db.charge(b(1), bucket, 2700000);
  if (struck.kind !== "charged") throw new Error("Expected charge");
  expect(db.refund(struck.receipt, 2700001)).toBe(true);
  for (let i = 0; i < 5; i++) db.charge(b(1), bucket, 2700002);
  expect(db.charge(b(1), bucket, 2700003)).toEqual({ kind: "locked", until: 3600002 });
}
