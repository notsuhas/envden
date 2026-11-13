import type { IFiles, IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";

type TFetch<T> = T | undefined | Promise<T | undefined>;

export interface IChainSource {
  header(hash: Uint8Array): TFetch<ISigned<IManifestHeader>>;
  entry(hash: Uint8Array): TFetch<ISigned<TEntry>>;
  files(hash: Uint8Array): TFetch<IFiles>;
  keyring(hash: Uint8Array): TFetch<Uint8Array>;
  epochKey(epoch: number): TFetch<Uint8Array>;
}

export interface ICheckpoint {
  header: ISigned<IManifestHeader>;
  files: IFiles;
  state: IDeviceListState;
  idKey: Uint8Array;
}
