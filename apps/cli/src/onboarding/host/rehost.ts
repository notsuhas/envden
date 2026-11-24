import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { installedServicePort } from "../../agent/service/installed.ts";
import { saveState } from "../../state/store/repository.ts";

// Tailscale and every device saved the installed port, so a rerun keeps it
export async function rehostServer(adapters: TAdapters, state: ILocalState) {
  const installed = await installedServicePort(process.platform, adapters.userHome);

  if (installed !== undefined) {
    await adapters.hostServer(installed);

    return;
  }

  const port = await adapters.serverPort();
  await adapters.hostServer(port);
  const address = await adapters.network.expose(port);
  if (!state.server) return;

  state.server.address = hostedAddress(state.server.address, address);
  await saveState(adapters.home, state, adapters.now);
}

// a vault hosted on another machine keeps its address
export function hostedAddress(saved: string, exposed: string) {
  return new URL(saved).hostname === new URL(exposed).hostname ? exposed : saved;
}
