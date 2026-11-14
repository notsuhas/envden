import { z } from "zod";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../../adapters.ts";
import type { ILocalState } from "../../../state/model.ts";
import { recoverSyncRecord, invalidSyncRecord } from "../../../state/store/records.ts";
import { basePath } from "../../local/files.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { binary } from "../../../client/encoding.ts";

const attemptSchema = z.object({
  header: z.string(),
  sequence: z.string().regex(/^\d+$/),
  places: z.array(z.string()),
  entries: z.array(z.string()),
});

export async function readAttempts(
  adapters: TAdapters,
  links: ILocalState["links"],
  report?: (message: string) => void,
) {
  const directory = join(adapters.home, "state", "attempts");
  const attempts = [];

  for (const name of await readdir(directory).catch(() => [])) {
    if (name.includes(".corrupt-")) continue;
    const path = join(directory, name);
    const marker = path + ".invalid";

    const record = await recoverSyncRecord(path, marker, decodeAttempt, report);

    if (record) attempts.push({ path, ...record });
    else {
      for (const link of links)
        await atomicWrite(basePath(adapters.home, link.store) + ".corrupt", path);

      await rm(marker, { force: true });
    }
  }

  return attempts.sort((a, b) => Number(BigInt(a.sequence) - BigInt(b.sequence)));
}

function decodeAttempt(saved: string) {
  const value = attemptSchema.parse(JSON.parse(saved));
  for (const entry of value.entries) p.decode(p.FileEntryCodec, binary(entry));

  return value;
}

export async function invalidAttemptState(home: string) {
  const directory = join(home, "state", "attempts");

  for (const name of await readdir(directory).catch(() => [])) {
    if (
      !name.includes(".corrupt-") &&
      (await invalidSyncRecord(join(directory, name), decodeAttempt))
    )
      return true;
  }

  return false;
}
