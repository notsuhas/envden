import { persistIdentity } from "./persist.ts";
import { mkdir, readFile } from "node:fs/promises";
import { restrictAccess } from "@envden/core/process";
import { join } from "node:path";
import { generateRecoveryKeys as generateServerIdentityKeys, equal } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IServerKeys } from "../http/types.ts";
import { binary, text } from "../http/encoding.ts";

export async function loadServerKeys(dataDir: string): Promise<IServerKeys> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const path = join(dataDir, "identity.json");
  await restrictAccess(dataDir, true);

  try {
    const data: unknown = JSON.parse(await readFile(path, "utf8"));
    await restrictAccess(path, false);

    if (
      !data ||
      typeof data !== "object" ||
      !("secretKey" in data) ||
      typeof data.secretKey !== "string" ||
      !("publicKey" in data) ||
      typeof data.publicKey !== "string"
    )
      throw new EnvdenError("INVALID_DATA", "Invalid server identity");

    const secretKey = binary(data.secretKey, 32);
    const publicKey = binary(data.publicKey, 32);
    const derived = generateServerIdentityKeys(() => secretKey).objPub;

    if (!equal(publicKey, derived))
      throw new EnvdenError("INVALID_DATA", "Invalid server identity");

    return { secretKey, publicKey };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }

  const keys = generateServerIdentityKeys();
  const data = { secretKey: text(keys.objSk), publicKey: text(keys.objPub) };
  await persistIdentity(dataDir, JSON.stringify(data));
  await restrictAccess(path, false);

  return { secretKey: keys.objSk, publicKey: keys.objPub };
}
