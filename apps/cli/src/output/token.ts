import type { Readable } from "node:stream";
import { EnvdenError } from "@envden/core/errors";
import { secret } from "./questions.ts";

export async function readToken(
  value: string | undefined,
  label: string,
  source: Readable & { isTTY?: boolean } = process.stdin,
) {
  if (value !== undefined) return value;
  if (source.isTTY) return secret(label);
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
