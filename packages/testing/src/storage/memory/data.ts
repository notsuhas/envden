import type {
  IStoredVault,
  IStoredHeader,
  IStoredSwap,
  IStoredDevice,
  IStoredJoinRequest,
} from "@envden/core/adapters";

export const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

export const equal = (a: Uint8Array | undefined, b: Uint8Array | undefined): boolean =>
  a === undefined || b === undefined ? a === b : hex(a) === hex(b);

export function createData() {
  return {
    vaults: new Map<string, IStoredVault>(),
    heads: new Map<string, Uint8Array>(),
    headers: new Map<string, IStoredHeader[]>(),
    entries: new Map<string, IStoredHeader[]>(),
    digests: new Set<string>(),
    lists: new Map<
      string,
      { vault: string; files: NonNullable<IStoredSwap["files"]>; at: number; permanent: boolean }
    >(),
    currentFiles: new Map<string, string>(),
    states: new Map<string, { vault: string; kind: string; key: Uint8Array; bytes: Uint8Array }>(),
    devices: new Map<string, IStoredDevice>(),
    blobs: new Map<string, { vault: string; hash: Uint8Array; bytes: Uint8Array; at: number }>(),
    setup: new Map<string, Uint8Array>(),
    sessions: new Map<string, { bytes: Uint8Array; expires: number }>(),
    nonces: new Map<string, number>(),
    approvers: new Map<string, { bytes: Uint8Array; expires: number }>(),
    joinRequests: new Map<number, IStoredJoinRequest>(),
    joinOpenings: [] as number[],
    buckets: new Map<string, { until: number; strikes: number }>(),
    charges: new Map<string, { key: string; at: number }>(),
    receipt: 0,
  };
}

export interface IMemoryContext {
  data: ReturnType<typeof createData>;
  depth: number;
}
