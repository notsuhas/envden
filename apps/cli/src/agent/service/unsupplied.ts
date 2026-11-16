import { EnvdenError } from "@envden/core/errors";

// a stand-in that never registers a real service; tests override hostServer when they need it
export async function unsuppliedHostServer(_port: number): Promise<{ log: string; path: string }> {
  throw new EnvdenError("INTERNAL", "No service adapter was supplied");
}
