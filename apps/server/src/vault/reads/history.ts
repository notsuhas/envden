import type { IAppOptions, IAuth } from "../../http/types.ts";
import type { IStoredHeader } from "@envden/core/adapters";
import { ObjectsResponseSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { requireRead } from "../access.ts";
import { input, text } from "../../http/encoding.ts";

export function readRange(
  options: IAppOptions,
  auth: IAuth,
  kind: "headers" | "entries",
  start: string | undefined,
  end: string | undefined,
) {
  requireRead(options, auth, "history");
  const from = input(() => BigInt(start ?? "0"));
  const to = input(() => BigInt(end ?? "18446744073709551615"));

  if (from < 0n || to < from || to > 0xffffffffffffffffn)
    throw new EnvdenError("INVALID_INPUT", "Invalid range");

  return ObjectsResponseSchema.parse({
    objects: pageObjects(options.storage[kind](auth.request.vaultId, from, to, 100, 786375)),
  });
}

function pageObjects(rows: IStoredHeader[]): string[] {
  const objects: string[] = [];
  let size = 0;

  for (const row of rows) {
    const encoded = text(row.bytes);
    size += encoded.length + 3;

    if (size > 1048500) {
      if (!objects.length) throw new EnvdenError("INVALID_DATA", "History object too large");
      break;
    }

    objects.push(encoded);
  }

  return objects;
}
