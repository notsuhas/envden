export const DEFAULT_SERVER_PORT = 4783;

interface IPortProbe {
  free: (port: number) => Promise<boolean>;
  envden: (port: number) => Promise<boolean>;
  anyFree: () => Promise<number>;
}

// keep the usual port when it's free or already ours; otherwise never fight another app for it
export async function chooseServerPort(probe: IPortProbe, preferred = DEFAULT_SERVER_PORT) {
  if ((await probe.free(preferred)) || (await probe.envden(preferred))) return preferred;

  return probe.anyFree();
}

// the service definition is the record of which port a hosted server uses
export function installedPort(definition: string): number | undefined {
  const match = /--port(?:<\/string><string>|"? "?|\s+)(\d{1,5})/.exec(definition);
  const port = match ? Number(match[1]) : NaN;

  return port >= 1 && port <= 65535 ? port : undefined;
}

export const systemPortProbe: IPortProbe = {
  free: async (port) => {
    try {
      await Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() }).stop(true);

      return true;
    } catch {
      return false;
    }
  },
  envden: async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      signal: AbortSignal.timeout(1000),
    }).catch(() => undefined);

    const body = (await response?.json().catch(() => undefined)) as { mode?: unknown } | undefined;

    return typeof body?.mode === "string";
  },
  anyFree: async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = server.port!;
    await server.stop(true);

    return port;
  },
};
