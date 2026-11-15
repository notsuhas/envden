import type { Context } from "../context.ts";

export async function startRepair(c: Context, server: Awaited<ReturnType<Context["server"]>>) {
  await server.stop();
  const restored = await c.server("server", true, server.data, new URL(server.url).port);
  await c.run("device-a", ["server", "repair", "--repair-token", restored.token]);

  return restored;
}
