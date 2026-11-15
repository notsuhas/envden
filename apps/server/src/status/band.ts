import { VAULT_QUOTA_BYTES } from "@envden/core/adapters";
import type { TQuotaBand } from "@envden/core/protocol";

export function deriveQuotaBand(usages: number[]): TQuotaBand | null {
  if (usages.length === 0) return null;

  const share = Math.max(...usages) / VAULT_QUOTA_BYTES;

  if (share >= 0.95) return "95-plus";
  if (share >= 0.8) return "80-95";
  if (share >= 0.5) return "50-80";

  return "below-50";
}
