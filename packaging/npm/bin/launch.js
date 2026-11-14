#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(
  new URL(
    process.platform === "win32" ? "../native/envden.exe" : "../native/envden",
    import.meta.url,
  ),
);

const child = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, ENVDEN_INSTALL_METHOD: "npm" },
});

if (child.error) {
  console.error(
    'envden: binary unavailable; run node "' +
      fileURLToPath(new URL("../install.js", import.meta.url)) +
      '" to finish installation.',
  );
  process.exit(1);
}

process.exit(child.status ?? 1);
