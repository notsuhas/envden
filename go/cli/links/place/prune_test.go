package place

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
)

func TestPruneRequiresPresentParent(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 100 }
	state := model.EmptyState("x")
	gone := filepath.Join(home, "gone")
	offline := filepath.Join(home, "offline", "repo")
	state.Approved = []model.Checkout{{Root: gone}, {Root: offline}}
	notices := []string{}
	if err := PruneMissingCheckouts(context.Background(), home, state, func(s string) { notices = append(notices, s) }, lock.Timing{Now: now}); err != nil {
		t.Fatal(err)
	}

	if len(state.Approved) != 1 || state.Approved[0].Root != offline || len(notices) != 1 || notices[0] != "Missing checkout removed: "+gone {
		t.Fatal(state.Approved, notices)
	}

	if _, err := os.Stat(filepath.Join(home, "state", "device.json")); err != nil {
		t.Fatal(err)
	}
}

func TestDeviceNumbers(t *testing.T) {
	for _, row := range []struct {
		value any
		want  int64
		ok    bool
	}{{&struct{ Dev int32 }{123}, 123, true}, {&struct{ Dev uint64 }{456}, 456, true}, {&struct{ Other int }{}, 0, false}} {
		got, ok := deviceNumber(row.value)
		if got != row.want || ok != row.ok {
			t.Fatal(row, got, ok)
		}
	}
}
