package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"os"
	"path/filepath"
	"testing"
)

func TestUntrackingOneCopyPreservesRemoval(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	path := filepath.Join(targets[0].Root, ".env")
	f.remove(f.second, path)
	cancelled, err := checkout.Untrack(f.ctx, f.second, targets[1].Root)
	must(t, err)
	equal(t, len(cancelled), 0)
	intent, err := operation.ReadDeletion(f.second.Home, targets[0].Store, clock)
	must(t, err)
	if intent == nil {
		t.Fatal("missing deletion")
	}
	equal(t, len(intent.Targets), 1)
	equal(t, intent.Targets[0], path)
	equal(t, f.push(f.second).Changed, 1)
	f.pull(f.first)
	equal(t, readValue(f.aStore), value{})
}
func TestUntrackDanglingOwnedLink(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "link")
	must(t, os.Remove(targets[1].Store))
	cancelled, err := checkout.Untrack(f.ctx, f.second, targets[1].Root)
	must(t, err)
	equal(t, len(cancelled), 0)
	_, err = os.Lstat(filepath.Join(targets[1].Root, ".env"))
	if !os.IsNotExist(err) {
		t.Fatal(err)
	}
}
func TestTakeServerAfterSkippedRemoval(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	s := f.state(f.second)
	approved := s.Approved
	s.Approved = s.Approved[:1]
	f.save(f.second, s)
	f.remove(f.second, filepath.Join(targets[0].Root, ".env"))
	f.write(filepath.Join(targets[1].Root, ".env"), "TOKEN=edited-copy\n")
	s.Approved = approved
	f.save(f.second, s)
	equal(t, f.push(f.second).Conflicts, 1)
	f.resolve(f.second, ".env", "take-server")
	f.push(f.second)
	f.pull(f.first)
	equal(t, f.read(f.aStore), original)
}
