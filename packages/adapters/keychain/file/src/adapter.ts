import { EnvdenError } from "@envden/core/errors";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { IKeychainAdapter } from "@envden/core/adapters";
import { keychainFailure } from "./failure.ts";
import { ownerOnly } from "./files/owner-only.ts";
import { readKeyFile, removeKeyFile, writeKeyFile } from "./files/source.ts";

interface IOptions {
  home: string;
}

export function createFileKeychainAdapter(options: IOptions): IKeychainAdapter {
  const directory = join(options.home, "state", "keys");

  const path = (name: string) =>
    join(directory, `${createHash("sha256").update(name).digest("hex")}.key`);

  const get = async (name: string, required = false) => {
    const value = await readKeyFile(path(name));

    if (value === undefined && required)
      throw new EnvdenError(
        "LOCKED",
        "No vault keys are stored on this device. If it was in the vault before, run envden join",
      );

    return value;
  };

  return {
    id: "file",
    ownerOnly: () => ownerOnly(directory).catch(keychainFailure),
    get: (name, required) => get(name, required).catch(keychainFailure),
    set: (name, value) => writeKeyFile(path(name), value).catch(keychainFailure),
    delete: (name) => removeKeyFile(path(name)).catch(keychainFailure),
  };
}
