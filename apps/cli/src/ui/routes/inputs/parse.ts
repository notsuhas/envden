import { EnvdenError } from "@envden/core/errors";
import type { z } from "zod";

export function parseInput<T extends z.ZodType>(schema: T, value: unknown, message: string) {
  const input = schema.safeParse(value);
  if (!input.success) throw new EnvdenError("INVALID_INPUT", message);

  return input.data as z.infer<T>;
}
