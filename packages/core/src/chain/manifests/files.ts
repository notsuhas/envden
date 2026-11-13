import { equal, FileEntryCodec, FilesCodec, H } from "../../protocol/index.ts";
import type { IFileEntry, IFiles } from "../../protocol/index.ts";
import { check, id } from "../shared/validation.ts";

export function checkedFiles(files: IFiles | undefined, hash: Uint8Array): IFiles {
  check(files && equal(H("files", FilesCodec.write(files)), hash));

  return files;
}

export function changedFiles(
  before: IFiles,
  after: IFiles,
  minimumEpoch: number,
  epoch: number,
  op?: number,
): IFileEntry[] {
  FilesCodec.write(before);
  FilesCodec.write(after);
  const old = new Map(before.entries.map((e) => [id(e.fileId), e]));
  const next = new Set(after.entries.map((e) => id(e.fileId)));
  check(before.entries.every((e) => next.has(id(e.fileId))));
  const changed: IFileEntry[] = [];

  for (const entry of after.entries) {
    const previous = old.get(id(entry.fileId));
    if (previous && equal(FileEntryCodec.write(previous), FileEntryCodec.write(entry))) continue;
    check(!previous || entry.version > previous.version);
    check(!previous || !equal(entry.name, previous.name));
    check(entry.epoch >= minimumEpoch && entry.epoch <= epoch);

    if (op !== undefined) {
      check(entry.epoch === epoch);

      check(
        op === 11
          ? previous && [1, 3].includes(previous.state) && [3, 4].includes(entry.state)
          : [1, 2].includes(entry.state),
      );
    }

    changed.push(entry);
  }

  return changed;
}
