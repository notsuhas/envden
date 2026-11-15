package journal

import (
	"github.com/notsuhas/envden/go/cli/state/model"
	"os"
	"path/filepath"
	"testing"
)

func TestPlacementJournal(t *testing.T) {
	home := t.TempDir()
	s := model.EmptyState("test")
	s.Checkpoint = "one"
	s.Links = []model.Link{{Root: "/repo", Path: ".env", Store: "/store", Mode: "link"}}
	if e := JournalPlacement(home, s, func() int64 { return 0 }); e != nil {
		t.Fatal(e)
	}
	raw, _ := os.ReadFile(filepath.Join(home, "state", "placement.json"))
	want := `{"checkpoint":"one","links":[{"root":"/repo","path":".env","store":"/store","mode":"link"}]}`
	if string(raw) != want {
		t.Fatal(string(raw))
	}
	loaded := model.EmptyState("test")
	loaded.Checkpoint = "one"
	if e := RestorePlacement(home, loaded); e != nil || len(loaded.Links) != 1 {
		t.Fatal(loaded, e)
	}
	if e := RestorePlacement(home, loaded); e != nil || len(loaded.Links) != 1 {
		t.Fatal(loaded, e)
	}
	loaded.Checkpoint = "two"
	loaded.Links = nil
	if e := RestorePlacement(home, loaded); e != nil || loaded.Links != nil {
		t.Fatal(loaded, e)
	}
	if e := ClearPlacement(home); e != nil {
		t.Fatal(e)
	}
}
