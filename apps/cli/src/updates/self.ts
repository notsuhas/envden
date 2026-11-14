import { downloadUpdate } from "./self/download.ts";
import { basename } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TFetch } from "../client/fetch.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { postInstall, managerUpdate } from "./self/execute.ts";
import { currentReleasePlatform } from "./self/platform.ts";
import { VERSION } from "../version.ts";
import { installMethod } from "./install.ts";
import { replaceBinary } from "./replace.ts";

export async function selfUpdate(
  adapters: TAdapters,
  options: {
    now: number;
    fetcher: TFetch;
    binary: string;
    confirm?: (command: string) => Promise<boolean>;
    run?: (command: string[]) => Promise<void>;
  },
) {
  const method = await installMethod(adapters.home, undefined, options.binary);

  if (method.kind === "manager")
    return managerUpdate(method.command, options.binary, options.confirm, options.run);

  await withStateLock(adapters.home, async () => {
    if (["bun", "node", "bun.exe", "node.exe"].includes(basename(options.binary)))
      throw new EnvdenError("INVALID_INPUT", "Self-update requires the installed envden binary");

    const bytes = await downloadUpdate(options.fetcher, VERSION, currentReleasePlatform()).catch(
      (cause: unknown) => {
        if (cause instanceof EnvdenError) throw cause;
        throw new EnvdenError("INVALID_DATA", "Release download failed", { cause });
      },
    );

    await replaceBinary(options.binary, bytes, process.platform === "win32");
  });

  await postInstall(options.binary, options.run);

  return { kind: "updated" as const };
}
