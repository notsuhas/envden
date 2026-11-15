import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { setup } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "file-options",
  roles: ["server", "device-a"],
  async run(c) {
    await setup(c);
    const d = c.get("device-a");

    for (const args of [
      ["config", "telemetry"],
      ["config", "update-check"],
      ["config", "agent-merge"],
      ["config", "auto-approve-worktrees", "off"],
      ["config", "placement", d.checkout, "copy"],
      ["config", "env-files", '{"include":[".env",".env.local"],"exclude":[]}'],
      ["device", "ls", "--verbose", "--json"],
    ])
      await c.run("device-a", args);

    await writeFile(join(d.checkout, ".env"), "TOKEN=changed\n");
    await c.run("device-a", ["push", "--all", "--yes", "--json"]);
    await c.run("device-a", ["history", "--all", "--json"]);
    const restore = c.pty("device-a", ["history", ".env", "--restore", "1"]);
    await restore.expect("?", "y");
    await c.finish("device-a", "history restore confirmation", restore);
    await c.run("device-a", ["rm", ".env", "--yes"]);
    await c.run("device-a", ["untrack", d.checkout]);
    const track = c.pty("device-a", ["track", d.checkout, "--copy", "--verbose"]);
    await track.expect("Sync env files for these checkouts", "\r");
    await c.finish("device-a", "track copy verbose", track);
  },
} satisfies IScenario;
