package client

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
	root, err := filepath.Abs("../../../")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("bun", "--eval", `import * as p from "../../../packages/core/src/protocol/index.ts";
import { createGenesis } from "../../../apps/cli/src/vault/genesis.ts";

const keys = p.generateDeviceKeys();
const identity = { keys, record: { ...keys, id: p.deviceId(keys), name: "test" } };
const material = await createGenesis(identity, new Uint8Array(32), 0);
const genesis = p.encode(p.signedCodec(p.EntryCodec), material.genesis);
const body = p.encode(p.EntryCodec, material.epoch.body);

body[74] = 99;

const unknown = p.concat(body, p.Sign(keys.objSk, "entry", body));
const headerBody = p.concat(Uint8Array.of(2, 2), identity.record.id);
const header = p.concat(headerBody, p.Sign(keys.objSk, "manifest", headerBody));

await Bun.write(
  process.env.ENVDEN_REPO + "/go/cli/client/testdata/history.json",
  JSON.stringify(
    {
      genesis: Buffer.from(genesis).toString("base64url"),
      unknown: Buffer.from(unknown).toString("base64url"),
      header: Buffer.from(header).toString("base64url"),
    },
    null,
    2,
  ) + "\n",
);
`)
	cmd.Env = append(os.Environ(), "ENVDEN_REPO="+root)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
