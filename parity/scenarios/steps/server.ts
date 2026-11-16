import { faultProxy } from "../../runtime/server/fault-proxy.ts";
import type { TServer } from "../../runtime/server/start.ts";
import type { TContext } from "../../runtime/context.ts";
import { known } from "../known.ts";
import { answerPassword } from "./onboarding.ts";

// Puts a fault proxy in front of a server; devices only ever see the proxy address.
export function faultable(server: TServer, path: string, status = 503) {
  const proxy = faultProxy(server.url, path, status);
  const stop = server.stop;

  server.url = proxy.url;

  server.stop = async () => {
    await proxy.stop();

    return stop();
  };

  return proxy;
}

export async function switchTo(c: TContext, device: string, url: string): Promise<void> {
  await c.cli(device, ["server", "switch", url], 1);

  await c.pty(
    device,
    ["server", "switch", url],
    known.switchUnlocks ? answerPassword : [],
    known.switchUnlocks ? 0 : 1,
  );
}
