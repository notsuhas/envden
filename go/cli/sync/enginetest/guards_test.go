package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiffSelection(t *testing.T) {
	for _, tc := range []struct{ approved, local, alias, selected, want bool }{{false, false, false, true, false}, {true, true, false, true, false}, {true, false, false, false, false}, {true, false, false, true, true}, {true, false, true, true, true}} {
		s := state.EmptyState("test")
		if tc.approved {
			s.Approved = append(s.Approved, state.Checkout{Root: "/repo", GitDir: "/repo/.git", RepoID: "repo"})
		}
		id := "repo"
		if tc.alias {
			s.Aliases.Set(id, "target")
			id = "target"
		}
		repos := map[string]bool{}
		if tc.selected {
			repos[id] = true
		}
		equal(t, syncer.IncludeLink(s, state.Link{Root: "/repo", Path: ".env", Store: "/store/.env", Mode: "link", LocalOnly: tc.local}, repos), tc.want)
	}
}
func TestRepairHazardConsumption(t *testing.T) {
	home := t.TempDir()
	must(t, remote.SavePendingRepairs(home, []string{"repo-a", "repo-b"}, clock))
	must(t, remote.ConsumeRepair(home, "repo-a", clock))
	pending, err := remote.PendingRepairs(home)
	must(t, err)
	equal(t, len(pending), 1)
	equal(t, pending[0], "repo-b")
}
func TestMissingRecordedBytesCannotDelete(t *testing.T) {
	for _, side := range []string{"mine", "server"} {
		t.Run(side, func(t *testing.T) {
			f := newFixture(t)
			f.pull(f.second)
			store := f.state(f.second).Links[0].Store
			f.write(store, "TOKEN=mine\n")
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)
			equal(t, f.pull(f.second).Conflicts, 1)
			records, err := local.ConflictRecords(f.second.Home)
			must(t, err)
			equal(t, len(records), 1)
			path, choice := records[0].Mine, "keep-mine"
			if side == "server" {
				path, choice = records[0].Server, "take-server"
			}
			must(t, os.Remove(path))
			_, err = syncer.ResolveConflict(f.ctx, f.second, syncer.ResolveOptions{File: ".env", Choice: choice, Now: clock})
			if !e.Is(err, e.InvalidInput) {
				t.Fatal(err)
			}
			equal(t, f.read(store), "TOKEN=mine\n")
			records, err = local.ConflictRecords(f.second.Home)
			must(t, err)
			equal(t, len(records), 1)
		})
	}
}
func TestAliasRefusesPlacedFiles(t *testing.T) {
	f := newFixture(t)
	err := syncer.AliasUnlinkedRepo(f.ctx, f.first, f.checkout.RepoID, "target")
	if !e.Is(err, e.Conflict) {
		t.Fatal(err)
	}
	equal(t, len(f.state(f.first).Aliases), 0)
}
func TestUntrackQuarantineClock(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	f.write(files.BasePath(f.second.Home, targets[0].Store)+".delete", "garbage")
	_, err := checkout.Untrack(f.ctx, f.second, targets[1].Root)
	must(t, err)
	directory := filepath.Join(f.second.Home, "base")
	names := func() []string {
		entries, err := os.ReadDir(directory)
		must(t, err)
		result := []string{}
		for _, entry := range entries {
			if strings.Contains(entry.Name(), ".corrupt-") {
				result = append(result, entry.Name())
			}
		}
		return result
	}
	before := names()
	equal(t, len(before), 1)
	f.pull(f.second)
	after := names()
	equal(t, strings.Join(after, "\n"), strings.Join(before, "\n"))
}
