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

test("doctor prints a pass/fail checklist", () => {
  expect(doctorText({ ...healthy, shells: [...healthy.shells] }).split("\n")).toEqual([
    "✓ Keys: private files in ~/.envden (owner-only, like ~/.ssh)",
    "✓ Symlinks work",
    "✓ envden is up to date",
    "✓ Tailscale: connected as box",
    "✓ HTTPS certificates enabled",
    "✓ Shell notice: zsh (/home/.zshrc)",
  ]);

  expect(
    doctorText({
      keys: { location: "~/.envden", ownerOnly: false },
      symlinks: false,
      update: { available: true, required: false },
      tailscale: { ready: false, running: true, loggedIn: false, httpsEnabled: false },
      https: {
        kind: "https-disabled",
        message: "Enable HTTPS certificates in the Tailscale admin console",
      },
      shells: [],
    }).split("\n"),
  ).toEqual([
    "✗ Keys: other users can read key files in ~/.envden; run chmod -R go-rwx ~/.envden",
    "! Symlinks unavailable; checkouts get copies",
    "! Update available; run envden update",
    "✗ Tailscale: not logged in",
    "✗ HTTPS certificates: Enable HTTPS certificates in the Tailscale admin console",
    "! Shell notice: not installed; run envden shell install",
  ]);
});
