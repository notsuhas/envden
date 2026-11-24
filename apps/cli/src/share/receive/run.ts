import { constants } from "node:fs";
import { access, lstat, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { openShare } from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import { writeThrough } from "../../agent/write-through.ts";
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
  if (await occupied(path)) {
    if (!options.interactive)
      throw new EnvdenError(
        "INVALID_INPUT",
        "The file exists. Name another file, or run this in a terminal to replace it",
      );

    if (!(await options.confirm(`Replace ${path}?`))) return { kind: "kept" as const, path };
  }

  const box = await claimBox(adapters.fetcher, claim);
  await writeThrough(path, openShare(share, box), adapters.now);

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

// Something is at `path`; anything but a file there, or an unwritable folder, fails before the claim.
async function occupied(path: string): Promise<boolean> {
  const entry = await lstat(path).catch(missing);
  const target = entry && (await stat(path).catch(missing));

  if (target && !target.isFile())
    throw new EnvdenError("INVALID_INPUT", "Save to a file, not a folder");

  await access(dirname(path), constants.W_OK).catch(writable);

  return entry !== undefined;
}

// A folder that doesn't exist yet is created on write.
function writable(cause: unknown): void {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return;
  throw new EnvdenError("INVALID_INPUT", "Can't write to that folder", { cause });
}

function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
