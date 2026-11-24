import type { ISigned, IManifestHeader, IFiles } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";

export interface ISwapContext {
  previous: ISigned<IManifestHeader>;
  state: IDeviceListState;
  files: IFiles;
  requestSigner: Uint8Array;
  missingBlobs: ReadonlySet<string>;
  destinationPin?: Uint8Array;
  ancestorHeaderHashes: ReadonlySet<string>;
}
