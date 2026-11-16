package identity

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestIdentityExactKeysAndEmptySecret(t *testing.T) {
	for _, row := range []struct {
		raw  string
		code errors.Code
	}{{`{"SECRETKEY":"","publicKey":"","opaqueSetup":""}`, errors.InvalidData}, {`{"secretKey":"","publicKey":"","opaqueSetup":""}`, errors.InvalidInput}} {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "identity.json"), []byte(row.raw), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadServerKeys(dir); !errors.Is(err, row.code) {
			t.Fatal(err)
		}
	}
}
