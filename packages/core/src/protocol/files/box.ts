import { fileId } from "./identity.ts";
import { type ICodec } from "../encoding/binary.ts";
import { concat, b32, u32, u64, encode, requireValue, equal } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { sealBox, openBox } from "../crypto/box.ts";
import { KDF } from "../crypto/kdf.ts";
import { H } from "../crypto/hash.ts";
import { pad, decodePadded } from "../encoding/padding.ts";
import { type IFileName } from "../codecs/content/file-name.ts";
import { FileNameCodec } from "../codecs/content/file-name.ts";
import { type IFile } from "../codecs/content/file.ts";
import { FileCodec } from "../codecs/content/file.ts";

export interface IFileContext {
  vaultId: Uint8Array;
  epoch: number;
  fileId: Uint8Array;
  version: bigint;
}

function fileAD(label: string, c: IFileContext): Uint8Array {
  return concat(
    ctx(label),
    b32.write(c.vaultId),
    u32.write(c.epoch),
    b32.write(c.fileId),
    u64.write(c.version),
  );
}

function sealFileValue<T>(
  codec: ICodec<T>,
  value: T,
  key: Uint8Array,
  c: IFileContext,
  label: string,
  rng: TRandom,
): Uint8Array {
  return sealBox(
    KDF(b32.write(key), c.vaultId, label + "-key", c.fileId),
    pad(encode(codec, value)),
    fileAD(label, c),
    rng,
  );
}

function openFileValue<T>(
  codec: ICodec<T>,
  box: Uint8Array,
  key: Uint8Array,
  c: IFileContext,
  label: string,
): T {
  return decodePadded(
    codec,
    openBox(KDF(b32.write(key), c.vaultId, label + "-key", c.fileId), box, fileAD(label, c)),
  );
}

export function sealFileName(
  value: IFileName,
  key: Uint8Array,
  c: IFileContext,
  rng: TRandom = randomBytes,
): Uint8Array {
  return sealFileValue(FileNameCodec, value, key, c, "file-name", rng);
}

export function openFileName(
  box: Uint8Array,
  key: Uint8Array,
  idKey: Uint8Array,
  c: IFileContext,
): IFileName {
  const value = openFileValue(FileNameCodec, box, key, c, "file-name");
  requireValue(equal(fileId(idKey, value.repoId, value.path), c.fileId), "File ID mismatch");

  return value;
}

export function sealFile(
  value: IFile,
  key: Uint8Array,
  c: IFileContext,
  rng: TRandom = randomBytes,
): Uint8Array {
  return sealFileValue(FileCodec, value, key, c, "file", rng);
}

export function openFile(
  box: Uint8Array,
  key: Uint8Array,
  idKey: Uint8Array,
  c: IFileContext,
  blobHash: Uint8Array,
  name: IFileName,
): IFile {
  requireValue(equal(H("blob", box), blobHash), "Blob hash mismatch");
  const value = openFileValue(FileCodec, box, key, c, "file");
  requireValue(equal(fileId(idKey, value.repoId, value.path), c.fileId), "File ID mismatch");
  requireValue(value.repoId === name.repoId && value.path === name.path, "File name mismatch");

  return value;
}
