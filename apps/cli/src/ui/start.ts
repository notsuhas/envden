import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import page from "./page/index.html";
import { createDashboardApp } from "./server/app.ts";
import { pageAssets } from "./server/assets.ts";
import { newToken } from "./server/token.ts";

interface IDashboardOptions {
  interactive: boolean;
  port?: number;
  now: () => number;
  report: (line: string) => void;
  open?: (url: string) => Promise<boolean>;
  stopped: Promise<unknown>;
}

export async function runDashboard(adapters: TAdapters, options: IDashboardOptions) {
  if (!options.interactive)
    throw new EnvdenError("INVALID_INPUT", "envden ui needs an interactive terminal");

  if (options.port !== undefined && !validPort(options.port))
    throw new EnvdenError("INVALID_INPUT", "Port must be 1-65535");

  const token = newToken();
  const assets = await pageAssets(page);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    fetch: (request) => app.fetch(request),
  });

  const port = server.port ?? options.port ?? 0;
  const app = createDashboardApp({ adapters, now: options.now, token, port, assets });
  const url = `http://127.0.0.1:${port}/#${token}`;

  try {
    options.report(`envden ui: ${url}`);
    options.report("Press Ctrl-C to stop.");

    if (options.open && !(await options.open(url)))
      options.report("Could not open a browser; open the link above.");

    await options.stopped;
  } finally {
    await server.stop(true);
  }

  return { kind: "stopped" as const };
}

function validPort(port: number) {
  return Number.isInteger(port) && port > 0 && port < 65536;
}
