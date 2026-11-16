package prettybytes

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/reference.mjs", []byte(`import prettyBytes from '../../../../apps/server/node_modules/pretty-bytes/index.js';
import {writeFileSync} from 'node:fs';
const fixtures=[];
for(const binary of [false,true]) for(const value of [0,-0,0.00000001,0.1,1,999,999.9,1000,1023,1024,1805,1850,1024**2-1,1024**2,1e9,-1805,Number.MAX_SAFE_INTEGER,1e24]) fixtures.push({value,binary,text:prettyBytes(value,{binary})});
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/reference.mjs") })

	cmd0 := exec.Command("bun", "testdata/reference.mjs")
	cmd0.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd0.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
