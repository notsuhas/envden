import { hostShims } from "../../harness/host/shims.ts";
import { setup } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "maintenance",
  roles: ["server", "device-a"],
  async run(c) {
    await setup(c);
    await hostShims(c, "device-a");

    for (const args of [
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
    ])
      await c.run("device-a", args);

    await c.run("device-a", ["ui", "--no-open"], 2);

    await c.finish(
      "device-a",
      "ui invalid port",
      c.pty("device-a", ["ui", "--port", "0", "--no-open"]),
      2,
    );

    const ui = c.pty("device-a", ["ui", "--no-open"]);
    const url = await ui.expect(/envden ui: (http:\/\/127\.0\.0\.1:\d+\/#[\w-]+)/);
    const response = await fetch(url);

    if (response.status !== 200 || !(await response.text()).includes("html"))
      throw new Error("Dashboard did not serve HTML");

    c.record("dashboard GET /", { stdout: "HTML served", stderr: "", code: response.status }, 200);
    await ui.expect("Press Ctrl-C to stop.", "\x03");
    await c.finish("device-a", "ui shutdown", ui);
  },
} satisfies IScenario;
