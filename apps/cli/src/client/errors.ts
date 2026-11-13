import { ErrorResponseSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export async function responseError(response: Response): Promise<EnvdenError> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (data && typeof data === "object" && "kind" in data && data.kind === "head-moved")
    return new EnvdenError("HEAD_MOVED", "The manifest head moved");

  const parsed = ErrorResponseSchema.safeParse(data);
  if (parsed.success) return new EnvdenError(parsed.data.error, "Server refused the request");

  return new EnvdenError("INVALID_DATA", "Invalid server response");
}
