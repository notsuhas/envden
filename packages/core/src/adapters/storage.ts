export interface IStoredVault {
  active: boolean;
  frozen: boolean;
  serverMoved?: Uint8Array;
  skRefused: boolean;
  unlockPeriod: number | null;
  restored?: {
    repairTokenHash: Uint8Array;
    restoredHead: Uint8Array;
    finishProgress?: Uint8Array;
  };
}

export interface IStoredObject {
  hash: Uint8Array;
  bytes: Uint8Array;
}

export interface IStoredHeader extends IStoredObject {
  seq: bigint;
}

export interface IStoredDevice {
  unlockedUntil: number;
  freshUntil: number;
  clientVersion: string;
  mailboxGrant?: Uint8Array;
}

export type TStateKind =
  | "keyring"
  | "envelope"
  | "skPub"
  | "opaqueRecord"
  | "repair-report"
  | "move-session"
  | "server-identity";

export interface IStateWrite {
  kind: TStateKind;
  key: Uint8Array;
  bytes?: Uint8Array;
}

export type TSessionKind = "login" | "join-ticket";

export interface ISessionKey {
  kind: TSessionKind;
  device: Uint8Array;
  purpose: string;
}

export interface IFileVersion {
  fileId: Uint8Array;
  version: bigint;
  blobHash?: Uint8Array | undefined;
  tombstone: boolean;
}

export interface IStoredSwap {
  header: IStoredHeader;
  entries: IStoredHeader[];
  filesHash?: Uint8Array;
  files?: IStoredObject & { versions: IFileVersion[]; retainForever?: boolean };
  bodyDigest: Uint8Array;
  state?: IStateWrite[];
  vault?: IStoredVault;
  devices?: { id: Uint8Array; state: IStoredDevice }[];
  approver?: { device: Uint8Array; bytes: Uint8Array };
  consumeSessions?: ISessionKey[];
  closeMailbox?: number;
  setupTokenHash?: Uint8Array;
  clearRepairReports?: boolean;
}

export type TCommitResult =
  | { kind: "committed" }
  | { kind: "retry-of-committed" }
  | { kind: "head-moved"; head?: Uint8Array };

export interface IHistoryPolicy {
  maxAge: number;
  minVersions: number;
}

export interface IStoredMailbox {
  number: number;
  device: Uint8Array;
  expiresAt: number;
  slots: Partial<Record<TMailboxSlot, Uint8Array>>;
}

export type TMailboxSlot = "KE1" | "KE2" | "KE3" | "PairJoiner";
export type TRateBucket = { kind: "member"; device: Uint8Array } | { kind: "non-member" };
export type TRateCharge = { kind: "charged"; receipt: string } | { kind: "locked"; until: number };

// Encoded objects are opaque; callers supply verified indexes and retention metadata.
export interface IStorageAdapter {
  readonly id: string;
  close(): void;
  transaction<T>(run: () => T): T;
  hasVault(vaultId: Uint8Array): boolean;
  vault(vaultId: Uint8Array): IStoredVault | undefined;
  configureVault(
    vaultId: Uint8Array,
    state: IStoredVault,
    writes?: IStateWrite[],
    setupTokenHash?: Uint8Array,
  ): void;
  discardInactiveVault(vaultId: Uint8Array): void;
  head(vaultId: Uint8Array): Uint8Array | undefined;
  commitSwap(
    vaultId: Uint8Array,
    expectedHead: Uint8Array | undefined,
    swap: IStoredSwap,
    now: number,
  ): TCommitResult;
  headers(vaultId: Uint8Array, fromSeq: bigint, toSeq: bigint): IStoredHeader[];
  header(vaultId: Uint8Array, hash: Uint8Array): IStoredHeader | undefined;
  entries(vaultId: Uint8Array, fromSeq: bigint, toSeq: bigint): IStoredHeader[];
  putFileList?(vaultId: Uint8Array, files: NonNullable<IStoredSwap["files"]>, now: number): void;
  fileList(vaultId: Uint8Array, hash: Uint8Array): Uint8Array | undefined;
  state(vaultId: Uint8Array, kind: TStateKind, key: Uint8Array): Uint8Array | undefined;
  states(vaultId: Uint8Array, kind: TStateKind): { key: Uint8Array; bytes: Uint8Array }[];
  writeState(vaultId: Uint8Array, writes: IStateWrite[]): void;
  device(vaultId: Uint8Array, device: Uint8Array): IStoredDevice | undefined;
  putDevice(vaultId: Uint8Array, device: Uint8Array, state: IStoredDevice): void;
  putBlob(
    vaultId: Uint8Array,
    hash: Uint8Array,
    bytes: Uint8Array,
    verify?: (bytes: Uint8Array) => Uint8Array,
  ): void;
  getBlob(vaultId: Uint8Array, hash: Uint8Array): Uint8Array | undefined;
  blobHashes(vaultId: Uint8Array): Uint8Array[];
  prune(vaultId: Uint8Array, policy: IHistoryPolicy, now: number): { lists: number; blobs: number };
  setupToken(): Uint8Array | undefined;
  setSetupToken(hash: Uint8Array): void;
  putSession(vaultId: Uint8Array, key: ISessionKey, bytes: Uint8Array, now: number): void;
  session(vaultId: Uint8Array, key: ISessionKey, now: number): Uint8Array | undefined;
  consumeSession(vaultId: Uint8Array, key: ISessionKey, now: number): Uint8Array | undefined;
  charge(vaultId: Uint8Array, bucket: TRateBucket, now: number): TRateCharge;
  refund(receipt: string, now: number): boolean;
  openMailbox(vaultId: Uint8Array, device: Uint8Array, now: number): IStoredMailbox | undefined;
  mailbox(vaultId: Uint8Array, number: number, now: number): IStoredMailbox | undefined;
  writeMailbox(
    vaultId: Uint8Array,
    number: number,
    slot: TMailboxSlot,
    bytes: Uint8Array,
    now: number,
  ): "written" | "identical" | "closed" | "out-of-order";
  closeMailbox(vaultId: Uint8Array, number: number): void;
  approver(vaultId: Uint8Array, device: Uint8Array, now: number): Uint8Array | undefined;
  rememberNonce(device: Uint8Array, nonce: Uint8Array, now: number): boolean;
}
