import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { packBackup, sealBackup, type IBackupFile, type TBackupKey } from "@envden/core/backup";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/store/repository.ts";
import { atomicWrite } from "../state/store/files.ts";
import { readBytes } from "../sync/local/files.ts";
import { confirmedPassphrase, keyChoice } from "./key.ts";
import { backupSources } from "./sources.ts";

// atomicWrite's in-flight or abandoned temp files, which may hold partial bytes.
const TEMPORARY = /^\.\d{13}_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/;

interface IExportOptions {
  out: string;
  cwd: string;
  recipients: string[];
  passphrase: boolean;
  secret: (label: string) => Promise<string>;
}

interface IExportResult {
  path: string;
  files: number;
  missing: number;
}

export async function exportBackup(
  adapters: Pick<TAdapters, "home" | "now">,
  options: IExportOptions,
): Promise<IExportResult> {
  const choice = keyChoice(options.recipients, options.passphrase);
  const path = await outputPath(options.cwd, options.out);

  if (await lstat(path).then(() => true, absent)) throw exists();

  const store = join(adapters.home, "store");
  // Damaged state only costs repo names: every store file still goes in, under unplaced/.
  const state = await loadState(adapters.home).catch(() => undefined);
  const { sources, missing } = backupSources(state, store, await storeFiles(store));
  const files: IBackupFile[] = [];

  for (const source of sources) {
    const bytes = await readBytes(source.path);
    if (bytes) files.push({ name: source.name, bytes });
  }

  if (files.length === 0)
    throw new EnvdenError("NOT_FOUND", "This device has no synced env files to export");

  const key: TBackupKey =
    choice.kind === "passphrase"
      ? { kind: "passphrase", passphrase: await confirmedPassphrase(options.secret) }
      : choice;

  const sealed = await sealBackup(key, await packBackup(files, adapters.now()));

  await atomicWrite(path, sealed, adapters.now, false).catch((cause: unknown) => {
    throw isCode(cause, "EEXIST") ? exists(cause) : cause;
  });

  return { path, files: files.length, missing: missing + sources.length - files.length };
}

// realpath follows a symlink before `..`, as the kernel does; the state writer also refuses symlinked parents.
async function outputPath(cwd: string, out: string): Promise<string> {
  if (out.endsWith("/"))
    throw new EnvdenError("INVALID_INPUT", "Write the backup to a file, not a folder");

  const entered = isAbsolute(out) ? out : `${cwd}/${out}`;

  const parent = await realpath(dirname(entered)).catch((cause: unknown) => {
    if (!isCode(cause, "ENOENT")) throw cause;
    throw new EnvdenError("NOT_FOUND", "The folder for the backup doesn't exist", { cause });
  });

  return join(parent, basename(entered));
}

async function storeFiles(store: string): Promise<string[]> {
  const entries = await readdir(store, { recursive: true, withFileTypes: true }).catch(
    (cause: unknown) => {
      absent(cause);

      return [];
    },
  );

  return entries
    .filter((entry) => entry.isFile() && !TEMPORARY.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function exists(cause?: unknown) {
  return new EnvdenError("CONFLICT", "The file exists. Name a file that doesn't exist yet", {
    cause,
  });
}

function absent(cause: unknown): false {
  if (isCode(cause, "ENOENT")) return false;
  throw cause;
}

function isCode(cause: unknown, code: string) {
  return cause instanceof Error && "code" in cause && cause.code === code;
}
