import type { Readable } from "node:stream";
import { EnvdenError } from "@envden/core/errors";
import { decodeToken, isToken } from "@envden/core/protocol";
import { secret } from "./questions.ts";

const LABEL = { setup: "Server setup token", repair: "Repair token" } as const;

export async function readToken(
  kind: "setup" | "repair",
  value: string | undefined,
  source: Readable & { isTTY?: boolean } = process.stdin,
) {
  if (source.isTTY && value === undefined)
    return secret(LABEL[kind], (text) => (isToken(kind, text) ? undefined : `Not a ${kind} token`));

  const token = value ?? (await piped(source));
  decodeToken(kind, token);

  return token;
}

async function piped(source: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  const token = Buffer.concat(chunks).toString("utf8").trim();

  if (!token)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Provide the token on stdin or use the prompt in a terminal",
    );

  return token;
}
