package parity

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "pack.js"), []byte(packScript), 0600); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "capture.js"), []byte(captureScript), 0600); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "reference.js"), []byte(referenceScript), 0600); err != nil {
		t.Fatal(err)
	}

	for _, args := range [][]string{{"test", "--preload", filepath.Join(dir, "capture.js"), "./apps/server/src"}, {filepath.Join(dir, "pack.js")}} {
		cmd := exec.Command("bun", args...)
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "ENVDEN_CAPTURE_HELPER="+filepath.ToSlash(filepath.Join(dir, "reference.js")), "ENVDEN_CAPTURE_DIR="+filepath.Join(dir, "captures"))
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s: %v\n%s", strings.Join(args, " "), err, output)
		}
	}
}
