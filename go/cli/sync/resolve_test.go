package sync

import (
	"os"
	"path/filepath"
	"testing"

	cm "github.com/notsuhas/envden/go/cli/model/conflicts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	e "github.com/notsuhas/envden/go/core/errors"
)

func TestResolutionAbsence(t *testing.T) {
	home := t.TempDir()
	entry := "encoded"
	record := cm.Record{File: filepath.Join(home, "edit"), Mine: filepath.Join(home, "mine"), Entry: &entry}
	if _, err := ResolutionBytes("edit", record, nil); !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	if _, err := ResolutionBytes("keep-mine", record, nil); !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	if _, err := ResolutionBytes("take-server", record, nil); !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	record.MineDeleted = true
	if value, err := ResolutionBytes("keep-mine", record, nil); err != nil || value != nil {
		t.Fatal(value, err)
	}
	if value, err := ResolutionBytes("edit", record, nil); err != nil || value != nil {
		t.Fatal(value, err)
	}
	record.Deleted = true
	if value, err := ResolutionBytes("take-server", record, nil); err != nil || value != nil {
		t.Fatal(value, err)
	}
	record.Entry = nil
	if _, err := ResolutionBytes("take-server", record, nil); !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	if err := os.WriteFile(record.File, []byte{}, 0600); err != nil {
		t.Fatal(err)
	}
	if value, err := ResolutionBytes("edit", record, nil); err != nil || value == nil {
		t.Fatal(value, err)
	}
}

func TestConflictSelection(t *testing.T) {
	records := []cm.Record{{Path: ".env", File: "/conflicts/a", Targets: []state.Link{{Root: "/a"}}}, {Path: ".env", File: "/conflicts/b", Targets: []state.Link{{Root: "/b"}}}}
	for _, tc := range []struct {
		options ResolveOptions
		count   int
	}{{ResolveOptions{}, 2}, {ResolveOptions{Repo: "/a"}, 1}, {ResolveOptions{File: "/b/.env"}, 1}, {ResolveOptions{File: "/conflicts/a"}, 1}, {ResolveOptions{File: ".env"}, 2}, {ResolveOptions{Repo: "/none"}, 0}} {
		if got := len(SelectConflicts(records, tc.options)); got != tc.count {
			t.Fatal(tc, got)
		}
	}
}
