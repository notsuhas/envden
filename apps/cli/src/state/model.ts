import type { IDeviceListState } from "@envden/core/chain";
import type { IReleaseState } from "@envden/core/protocol";

export interface ILocalState {
  format: 1;
  verifiedState?: IDeviceListState;
  aliasAsked?: string[];
  deviceName: string;
  vaultId?: string;
  creationPending?: string;
  server?: { address: string; pin: string; protocol: number };
  checkpoint?: string;
  headers: string[];
  entries: string[];
  keyring?: string;
  files?: string;
  session?: { unlockedUntil: number | null; freshUntil: number };
  approved: {
    root: string;
    gitDir: string;
    repoId: string;
    identity?: string;
    rootDevice?: number;
  }[];
  links: { root: string; path: string; store: string; mode: "link" | "copy"; localOnly?: true }[];
  aliases: Record<string, string>;
  telemetry: boolean;
  updateCheck: boolean;
  release?: IReleaseState;
  lastFeedCheck?: number;
  latest?: string;
}

export function emptyState(deviceName: string): ILocalState {
  return {
    format: 1,
    deviceName,
    headers: [],
    entries: [],
    approved: [],
    links: [],
    aliases: {},
    telemetry: false,
    updateCheck: true,
  };
}
