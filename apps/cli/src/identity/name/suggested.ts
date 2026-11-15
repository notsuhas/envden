import { fitDeviceName } from "./fit.ts";

export function suggestedDeviceName(hostname: string) {
  const host = hostname.replace(/[\p{Cc}\p{Cf}]/gu, "").split(".")[0]!;
  const name = fitDeviceName(host.trim()).trim();

  return name || "device";
}
