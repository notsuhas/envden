import { EnvdenError } from "@envden/core/errors";

const budgets = {
  member: { capacity: 134217728, concurrency: Infinity, reserved: 0, active: 0 },
  authorized: { capacity: 134217728, concurrency: 2, reserved: 0, active: 0 },
  public: { capacity: 1048576, concurrency: 8, reserved: 0, active: 0 },
};

export function reserveBody(bytes: number, member: boolean | "authorized" = true): () => void {
  const budget =
    member === "authorized" ? budgets.authorized : member ? budgets.member : budgets.public;

  if (bytes === 0) return () => {};

  if (budget.reserved + bytes > budget.capacity || budget.active >= budget.concurrency)
    throw new EnvdenError("BUSY", "Body budget exceeded");

  budget.reserved += bytes;
  budget.active++;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    budget.reserved -= bytes;
    budget.active--;
  };
}
