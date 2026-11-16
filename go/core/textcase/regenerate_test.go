package textcase

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/reference.mjs", []byte(`import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('./case.json', import.meta.url);
const rows = JSON.parse(readFileSync(file)).map(({ text }) => ({ text, lower: text.toLowerCase(), upper: text.toUpperCase() }));
writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
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
