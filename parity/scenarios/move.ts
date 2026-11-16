import type { IScenario } from "./types.ts";
import { setup, answerPassword } from "./onboarding.ts";

export const moveScenarios: IScenario[] = ["resume", "abort"].map((action) => ({
  name: `server-move-${action}`,
  steps: [
    ...setup(),
    {
      name: `interrupt and ${action} move at a protocol boundary`,
      run: async (c) => {
        const destination = await c.serve("destination");
        let fail = true;

        const proxy = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          async fetch(request) {
            const url = new URL(request.url);

            if (fail && url.pathname === (action === "resume" ? "/v1/swap" : "/v1/move/chain"))
              return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

            return fetch(
              new Request(new URL(url.pathname + url.search, destination.url).href, request),
            );
          },
        });

        try {
          const address = `http://127.0.0.1:${proxy.port}`;

          await c.pty(
            "a",
            ["server", "move", address, "--setup-token", destination.token],
            answerPassword,
            1,
          );

          fail = false;
          await c.pty("a", ["server", "move", `--${action}`], answerPassword);
          await c.cli("a", ["device", "ls", "--json"]);
        } finally {
          await proxy.stop(true);
        }
      },
    },
  ],
}));
