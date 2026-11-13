import { kitJoin } from "../../vault/recovery/kit.ts";

export function kitRejoin(
  adapters: Parameters<typeof kitJoin>[0],
  options: Parameters<typeof kitJoin>[1],
) {
  return kitJoin(adapters, { ...options, rejoin: true });
}
