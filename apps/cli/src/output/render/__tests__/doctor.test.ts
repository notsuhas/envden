import { expect, test } from "bun:test";
import { doctorText } from "../doctor.ts";

const healthy = {
  keys: { location: "~/.envden", ownerOnly: true },
  symlinks: true,
  update: { available: false, required: false },
  tailscale: { ready: true, running: true, loggedIn: true, httpsEnabled: true, hostname: "box" },
  https: { kind: "ready" },
  shells: [
    { shell: "zsh", path: "/home/.zshrc", installed: true },
    { shell: "bash", path: "/home/.bashrc", installed: false },
  ],
} as const;

const marks = (text: string) => text.split("\n").map((line) => line[0]);

test("doctor prints a pass/fail checklist with the fix for each failure", () => {
  const passing = doctorText({ ...healthy, shells: [...healthy.shells] });

  expect(marks(passing)).toEqual(["✓", "✓", "✓", "✓", "✓", "✓"]);
  expect(passing).toContain("box");
  expect(passing).toContain("zsh (/home/.zshrc)");
  expect(passing).not.toContain("bash");

  const failing = doctorText({
    keys: { location: "~/.envden", ownerOnly: false },
    symlinks: false,
    update: { available: true, required: false },
    tailscale: { ready: false, running: true, loggedIn: false, httpsEnabled: false },
    https: { kind: "https-disabled", message: "Enable HTTPS in the admin console" },
    shells: [],
  });

  expect(marks(failing)).toEqual(["✗", "!", "!", "✗", "✗", "!"]);

  for (const fix of [
    "chmod -R go-rwx ~/.envden",
    "envden update",
    "not logged in",
    "Enable HTTPS in the admin console",
    "envden shell install",
  ])
    expect(failing).toContain(fix);
});
