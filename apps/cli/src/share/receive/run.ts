import { constants } from "node:fs";
import { access, lstat, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EnvdenError, isEnvdenError } from "@envden/core/errors";
import { openShare } from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import { linkTarget } from "../../agent/write-through.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { parseShareLink } from "./link.ts";

interface IReceiveOptions {
  link: string;
  out: string;
  cwd: string;
  interactive: boolean;
  confirm: (message: string) => Promise<boolean>;
}

// The page's limit plus the version, nonce and tag around it.
const MAX_BOX = 1048576 + 29;

export async function receiveFile(
  adapters: Pick<TAdapters, "fetcher" | "now">,
  options: IReceiveOptions,
) {
  const { claim, share } = parseShareLink(options.link);
  const path = resolve(options.cwd, options.out);

  // Decided before claiming: the link works once, so a refusal afterwards would lose the file.
  if ((await lstat(path).catch(missing)) !== undefined) {
    if ((await stat(path).catch(missing))?.isDirectory()) throw notAFile();

    if (!options.interactive)
      throw new EnvdenError(
        "INVALID_INPUT",
        "The file exists. Name another file, or run this in a terminal to replace it",
      );

    if (!(await options.confirm(`Replace ${path}?`))) return { kind: "kept" as const, path };
  }

  const target = await writableTarget(path);
  const box = await claimBox(adapters.fetcher, claim);
  await atomicWrite(target, openShare(share, box), adapters.now);

  return { kind: "saved" as const, path };
}

async function claimBox(fetcher: TAdapters["fetcher"], claim: string): Promise<Uint8Array> {
  const response = await fetcher(claim, { method: "POST", redirect: "error" }).catch(
    (cause: unknown) => {
      throw new EnvdenError(
        "SERVER_UNREACHABLE",
        "Couldn't reach the sender. The link may have closed",
        { cause },
      );
    },
  );

  if (response.status === 410)
    throw new EnvdenError(
      "NOT_FOUND",
      "This link was already opened. Ask the sender for a new one",
    );

  if (!response.ok)
    throw new EnvdenError(
      "NOT_FOUND",
      "This link has expired or closed. Ask the sender for a new one",
    );

  const box = new Uint8Array(await response.arrayBuffer());
  if (box.length > MAX_BOX) throw new EnvdenError("INVALID_DATA", "The shared file is too large");

  return box;
}

// Resolves links and creates the folder now, so an unwritable destination fails before the claim.
async function writableTarget(path: string): Promise<string> {
  try {
    const target = await linkTarget(path);
    const info = await stat(target).catch(missing);

    if (info && !info.isFile()) throw notAFile();

    await access(dirname(target), constants.W_OK);

    return target;
  } catch (cause) {
    if (isEnvdenError(cause)) throw cause;
    throw new EnvdenError("INVALID_INPUT", "Can't write to that folder", { cause });
  }
}

function notAFile() {
  return new EnvdenError("INVALID_INPUT", "Save to a file, not a folder");
}

function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
