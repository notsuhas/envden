import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateRecoveryKeys,
  opaqueCreateSetup,
  opaqueMessage,
  OPAQUE_LENGTHS,
  equal,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IServerKeys } from "../http/types.ts";
import { binary, text } from "../http/encoding.ts";

export async function loadServerKeys(dataDir: string): Promise<IServerKeys> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const path = join(dataDir, "identity.json");

  try {
    const data: unknown = JSON.parse(await readFile(path, "utf8"));

    if (
      !data ||
      typeof data !== "object" ||
      !("secretKey" in data) ||
      typeof data.secretKey !== "string" ||
      !("publicKey" in data) ||
      typeof data.publicKey !== "string" ||
      !("opaqueSetup" in data) ||
      typeof data.opaqueSetup !== "string"
    )
      throw new EnvdenError("INVALID_DATA", "Invalid server identity");

    const secretKey = binary(data.secretKey, 32);
    const publicKey = binary(data.publicKey, 32);
    const derived = generateRecoveryKeys(() => secretKey).objPub;

    if (!equal(publicKey, derived))
      throw new EnvdenError("INVALID_DATA", "Invalid server identity");

    return {
      secretKey,
      publicKey,
      opaqueSetup: opaqueMessage(data.opaqueSetup, OPAQUE_LENGTHS.serverSetup),
    };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }

  const keys = generateRecoveryKeys();
  const opaqueSetup = await opaqueCreateSetup();
  const data = { secretKey: text(keys.objSk), publicKey: text(keys.objPub), opaqueSetup };
  await writeFile(path, JSON.stringify(data), { mode: 0o600, flag: "wx" });

  return { secretKey: keys.objSk, publicKey: keys.objPub, opaqueSetup };
}
