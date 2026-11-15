import { expect, test } from "bun:test";
import { createBodyBudget } from "../body-budget.ts";

function identity(vault: number, device: number) {
  return { vaultId: new Uint8Array(32).fill(vault), device: new Uint8Array(32).fill(device) };
}

test("member device budgets use identity bytes and release reservations once", () => {
  const reserveBody = createBodyBudget();
  const first = reserveBody(67108864, "member", identity(1, 1));

  try {
    expect(() => reserveBody(1, "member", identity(1, 1))).toThrow();
    const second = reserveBody(65536, "member", identity(1, 2));
    second();
    second();
  } finally {
    first();
    first();
  }

  const released = reserveBody(67108864, "member", identity(1, 1));
  released();
});

test("vault budgets bound multiple devices while leaving capacity for another vault", () => {
  const reserveBody = createBodyBudget();
  const first = reserveBody(67108864, "member", identity(1, 1));
  const second = reserveBody(33554432, "member", identity(1, 2));

  try {
    expect(() => reserveBody(1, "member", identity(1, 3))).toThrow();
    const other = reserveBody(33554432, "member", identity(2, 1));
    other();
  } finally {
    first();
    second();
  }
});

test("each budget is independent", () => {
  const release = createBodyBudget()(67108864, "member", identity(1, 1));

  try {
    createBodyBudget()(67108864, "member", identity(1, 1))();
  } finally {
    release();
  }
});
