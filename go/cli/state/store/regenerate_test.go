package store

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}
	root, err := filepath.Abs("../../../../")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("bun", "--eval", `import { emptyState } from "../../../../apps/cli/src/state/model.ts";
import { saveState } from "../../../../apps/cli/src/state/store/repository.ts";
import { setConfig } from "../../../../apps/cli/src/settings/config.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const home = await mkdtemp(tmpdir() + "/envden-parity-");

try {
  const state = emptyState("test");
  await saveState(home, state, () => 1800000000000);
  const empty = await readFile(home + "/state/device.json", "utf8");
  state.vaultId = "vault";
  state.session = { unlockedUntil: null, freshUntil: 123 };
  state.headers = ["first-header"];
  state.verifiedState = {
    devices: new Map([["d", { id: Uint8Array.of(1) }]]),
    seq: 123n,
    repairIds: new Set(["a"]),
  };
  await saveState(home, state, () => 1800000000000);
  const rich = await readFile(home + "/state/device.json", "utf8");
  await setConfig("telemetry", "on", home, () => 1800000000000);
  await setConfig("placement", '{"z":"link","a":"copy"}', home, () => 1800000000000);
  const config = await readFile(home + "/config.json", "utf8");
  await Bun.write(
    process.env.ENVDEN_REPO + "/go/cli/state/store/testdata/ts-state.json",
    JSON.stringify({ empty, rich, config }, null, 2) + "\n",
  );
} finally {
  await rm(home, { recursive: true, force: true });
}
`)
	cmd.Env = append(os.Environ(), "ENVDEN_REPO="+root)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
