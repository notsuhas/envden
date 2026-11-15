package repair

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	"testing"
)

func TestRestoreKind(t *testing.T) {
	for _, row := range []struct {
		vault a.StoredVault
		want  string
	}{{a.StoredVault{Active: true}, "repair"}, {a.StoredVault{}, "moving"}, {a.StoredVault{ServerMoved: make([]byte, 32)}, "moved"}, {a.StoredVault{Active: true, ServerMoved: make([]byte, 32), Restored: &a.StoredRestored{}}, "moved"}, {a.StoredVault{Active: true, Frozen: true}, "repair"}} {
		if got := RestoreKind(row.vault); got != row.want {
			t.Fatal(got, row.want)
		}
	}
}
