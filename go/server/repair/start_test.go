package repair

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func TestRestoreKind(t *testing.T) {
	for _, row := range []struct {
		vault adapters.StoredVault
		want  string
	}{{adapters.StoredVault{Active: true}, "repair"}, {adapters.StoredVault{}, "moving"}, {adapters.StoredVault{ServerMoved: make([]byte, 32)}, "moved"}, {adapters.StoredVault{Active: true, ServerMoved: make([]byte, 32), Restored: &adapters.StoredRestored{}}, "moved"}, {adapters.StoredVault{Active: true, Frozen: true}, "repair"}} {
		if got := RestoreKind(row.vault); got != row.want {
			t.Fatal(got, row.want)
		}
	}
}
