import { StatusResponseSchema } from "@envden/core/protocol";

export function statusBody(value: unknown) {
  const status = StatusResponseSchema.parse(value);

  return { ...status, uptimeSeconds: "<DURATION>" };
}
