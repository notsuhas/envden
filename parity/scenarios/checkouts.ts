import { writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "../harness/onboarding.ts";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "checkouts",
  roles: ["server", "device-a"],
  async run(c) {
    await setup(c);
    const d = c.get("device-a");
    await c.git("device-a", ["add", ".gitignore"]);
    await c.git("device-a", ["commit", "--quiet", "-m", "initial"]);

    await c.git("device-a", [
      "worktree",
      "add",
      "--quiet",
      join(d.home, "worktree"),
      "-b",
      "worktree",
    ]);

    await c.run("device-a", ["pull", "--yes", "--all"]);
    await c.run("device-a", ["status", "--json"]);
    await c.run("device-a", ["local-only", ".env"]);
    await c.run("device-a", ["untrack", d.checkout]);
    const target = join(d.home, "external.env");
    await writeFile(target, "TOKEN=external\n");
    await import("node:fs/promises").then((fs) => fs.unlink(join(d.checkout, ".env")));
    await symlink(target, join(d.checkout, ".env"));
    const track = c.pty("device-a", ["track", d.checkout]);
    await track.expect("Sync env files for these checkouts", "\r");
    await track.expect("Let envden manage it?", "y");
    await c.finish("device-a", "track takeover", track);
    await c.run("device-a", ["untrack", d.checkout]);
  },
} satisfies IScenario;
