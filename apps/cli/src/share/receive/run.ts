import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
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
  if (await exists(path)) {
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

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}
