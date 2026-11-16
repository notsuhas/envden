package git

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/reference.mjs", []byte(`import { normalizeRepoId } from '../../../../../packages/adapters/repo/git/src/repo-id/normalize.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('./repo-id-vectors.json', import.meta.url);
const rows = JSON.parse(readFileSync(file)).map(({ remote, hostname }) => {
  try {
    return { remote, ...(hostname === undefined ? {} : { hostname }), expected: normalizeRepoId(remote, hostname) };
  } catch (error) {
    return { remote, ...(hostname === undefined ? {} : { hostname }), error: error.message };
  }
});
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
