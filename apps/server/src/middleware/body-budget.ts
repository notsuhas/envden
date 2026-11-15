import type { IRequest } from "@envden/core/protocol";
import { text } from "../http/encoding.ts";
import { EnvdenError } from "@envden/core/errors";

type TBudget = "member" | "authorized" | "public";

type TIdentity = Pick<IRequest, "vaultId" | "device">;

export type TReserveBody = (bytes: number, kind?: TBudget, identity?: TIdentity) => () => void;

function createState() {
  return {
    budgets: {
      member: { capacity: 134217728, concurrency: Infinity, reserved: 0, active: 0 },
      authorized: { capacity: 134217728, concurrency: 2, reserved: 0, active: 0 },
      public: { capacity: 1048576, concurrency: 8, reserved: 0, active: 0 },
    },
    devices: new Map<string, number>(),
    vaults: new Map<string, number>(),
  };
}

export function createBodyBudget(): TReserveBody {
  const state = createState();

  return (bytes, kind = "member", identity) => reserve(state, bytes, kind, identity);
}

function scopeKeys(kind: TBudget, identity?: TIdentity) {
  const vault = kind === "member" && identity ? text(identity.vaultId) : undefined;

  return { vault, device: vault && identity ? `${vault}:${text(identity.device)}` : undefined };
}

function overBudget(
  budget: { capacity: number; concurrency: number; reserved: number; active: number },
  bytes: number,
  deviceBytes?: number,
  vaultBytes?: number,
) {
  return (
    budget.reserved + bytes > budget.capacity ||
    budget.active >= budget.concurrency ||
    (deviceBytes !== undefined && deviceBytes + bytes > 67108864) ||
    (vaultBytes !== undefined && vaultBytes + bytes > 100663296)
  );
}

function reserve(
  state: ReturnType<typeof createState>,
  bytes: number,
  kind: TBudget,
  identity?: TIdentity,
): () => void {
  if (bytes === 0) return () => {};
  const { devices, vaults } = state;
  const budget = state.budgets[kind];
  const { vault, device } = scopeKeys(kind, identity);
  const deviceBytes = device ? (devices.get(device) ?? 0) : undefined;
  const vaultBytes = vault ? (vaults.get(vault) ?? 0) : undefined;

  if (overBudget(budget, bytes, deviceBytes, vaultBytes))
    throw new EnvdenError("BUSY", "Body budget exceeded");

  budget.reserved += bytes;
  budget.active++;
  if (device) devices.set(device, deviceBytes! + bytes);
  if (vault) vaults.set(vault, vaultBytes! + bytes);
  let released = false;

  return () => {
    if (released) return;
    released = true;
    budget.reserved -= bytes;
    budget.active--;
    if (device) releaseScope(devices, device, bytes);
    if (vault) releaseScope(vaults, vault, bytes);
  };
}

function releaseScope(scopes: Map<string, number>, key: string, bytes: number) {
  const remaining = (scopes.get(key) ?? 0) - bytes;

  if (remaining) scopes.set(key, remaining);
  else scopes.delete(key);
}
