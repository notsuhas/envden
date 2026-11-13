import type { IStorageAdapter } from "@envden/core/adapters";
import type { IRequest } from "@envden/core/protocol";

export interface IServerKeys {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  opaqueSetup: string;
}

export interface IAppOptions {
  storage: IStorageAdapter;
  now: () => number;
  serverKeys: IServerKeys;
  config: {
    appVersion: string;
    minClient: string;
  };
}

export interface IAuth {
  request: IRequest;
  member: boolean;
  proof?: Uint8Array;
}

export type TServerEnv = { Variables: { auth: IAuth } };
