import type { IDeviceListState } from "@envden/core/chain";

export interface ILocalState {
  format: 2;
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
  approved: {
    root: string;
    gitDir: string;
    repoId: string;
    identity?: string;
    rootDevice?: number;
  }[];
  links: {
    root: string;
    path: string;
    store: string;
    mode: "link" | "copy";
    localOnly?: true;
    // the user's own link text, restored by untrack
    originalLink?: string;
  }[];
  aliases: Record<string, string>;
  telemetry: boolean;
  updateCheck: boolean;
  latest?: string;
}

// Prototype-free, so repo IDs like constructor or __proto__ are plain keys.
export function aliasMap(aliases: Record<string, string> = {}): Record<string, string> {
  return Object.assign(Object.create(null), aliases);
}

export function emptyState(deviceName: string): ILocalState {
  return {
    format: 2,
    deviceName,
    headers: [],
    entries: [],
    approved: [],
    links: [],
    aliases: aliasMap(),
    telemetry: false,
    updateCheck: true,
  };
}
