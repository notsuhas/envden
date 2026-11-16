import { known } from "../known.ts";
import { cli } from "../steps/cli.ts";
import { request } from "../steps/http.ts";
import { setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

const commands = [
  ["doctor"],
  ["doctor", "--json"],
  ["version"],
  ["agent", "install"],
  ["agent", "install"],
  ["update", "--post-install"],
  ["history"],
  ["history", ".env"],
  ["diff", "--all"],
  ["diff", "--all", "--json"],
  ["pull", "--all", "--yes", "--json"],
];

export const maintenance: IScenario = {
  name: "maintenance",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    ...commands.map((args) => cli("a", args)),
    {
      name: "HEAD on server GET routes",
      run: async (c) => {
        const url = c.servers.get("main")!.url;

        await request(c, "server status", `${url}/v1/status`);

        if ((await request(c, "server status", `${url}/v1/status`, "HEAD")) !== known.headStatus)
          throw new Error("HEAD /v1/status changed; update known.headStatus");
      },
    },
    cli("a", ["ui", "--no-open"], 2),
    {
      name: "ui rejects port zero",
      run: async (c) => {
        await c.pty("a", ["ui", "--port", "0", "--no-open"], [], 2);
      },
    },
    {
      name: "ui serves the dashboard and stops on Ctrl-C",
      run: async (c) => {
        const ui = c.terminal("a", ["ui", "--no-open"]);
        const url = await ui.expect(/envden ui: (http:\/\/127\.0\.0\.1:\d+\/#[\w-]+)/);

        if ((await request(c, "dashboard", url)) !== 200) throw new Error("Dashboard failed");

        await request(c, "dashboard", url, "HEAD");
        await ui.expect("Press Ctrl-C to stop.");
        ui.send("\x03");
        await c.finish("a", ["ui"], ui);
      },
    },
  ],
};
