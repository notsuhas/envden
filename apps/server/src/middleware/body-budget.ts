import type { IRequest } from "@envden/core/protocol";
import { text } from "../http/encoding.ts";
import { EnvdenError } from "@envden/core/errors";

const budgets = {
  member: { capacity: 134217728, concurrency: Infinity, reserved: 0, active: 0 },
  authorized: { capacity: 134217728, concurrency: 2, reserved: 0, active: 0 },
  public: { capacity: 1048576, concurrency: 8, reserved: 0, active: 0 },
};

const devices = new Map<string, number>();
const vaults = new Map<string, number>();

type TBudget = keyof typeof budgets;

export function reserveBody(
  bytes: number,
  kind: TBudget = "member",
  identity?: Pick<IRequest, "vaultId" | "device">,
): () => void {
  if (bytes === 0) return () => {};
  const budget = budgets[kind];
  const vault = kind === "member" ? identity && text(identity.vaultId) : undefined;
  const device = vault && identity ? `${vault}:${text(identity.device)}` : undefined;
  const deviceBytes = device ? (devices.get(device) ?? 0) : 0;
  const vaultBytes = vault ? (vaults.get(vault) ?? 0) : 0;

  if (
    budget.reserved + bytes > budget.capacity ||
    budget.active >= budget.concurrency ||
    (device && deviceBytes + bytes > 67108864) ||
    (vault && vaultBytes + bytes > 100663296)
  )
    throw new EnvdenError("BUSY", "Body budget exceeded");

  budget.reserved += bytes;
  budget.active++;
  if (device) devices.set(device, deviceBytes + bytes);
  if (vault) vaults.set(vault, vaultBytes + bytes);
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
