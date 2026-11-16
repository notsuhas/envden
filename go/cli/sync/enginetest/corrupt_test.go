package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/lineage"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCorruptRecordsQuarantinedAndResolvable(t *testing.T) {
	for _, suffix := range []string{".entry", ".pending", ".delete", "attempt"} {
		t.Run(suffix, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout("copy")[0]
			path := files.BasePath(f.second.Home, target.Store) + suffix
			if suffix == "attempt" {
				path = filepath.Join(f.second.Home, "state", "attempts", strings.Repeat("A", 43))
			}
			f.write(path, "{invalid")
			must(t, os.Chtimes(path, time.UnixMilli(0), time.UnixMilli(0)))
			f.write(filepath.Join(target.Root, ".env"), "TOKEN=mine\n")
			r := f.push(f.second)
			equal(t, r.Conflicts, 1)
			equal(t, r.Changed, 0)
			held, err := lineage.HeldBackFiles(f.second, syncLinks(f))
			must(t, err)
			if len(held) == 0 {
				t.Fatal("missing held back notice")
			}
			entries, err := os.ReadDir(filepath.Dir(path))
			must(t, err)
			found := false
			for _, entry := range entries {
				if strings.HasPrefix(entry.Name(), filepath.Base(path)+".corrupt-") {
					found = true
				}
			}
			equal(t, found, true)
			f.resolve(f.second, ".env", "keep-mine")
			equal(t, f.push(f.second).Conflicts, 0)
		})
	}
}
func TestInvalidAppliedStateNamedError(t *testing.T) {
	f := newFixture(t)
	f.layout("copy")
	path := filepath.Join(f.second.Home, "state", "applied-files.json")
	f.write(path, "{invalid")
	_, err := syncer.Pull(f.ctx, f.second, f.opts)
	_, named := e.As(err)
	equal(t, named, true)
	if err == nil || !strings.Contains(err.Error(), path) {
		t.Fatal(err)
	}
}
func TestUntrackCancelsRemovalWithCorruptPending(t *testing.T) {
	f := newFixture(t)
	target := f.layout("copy")[0]
	path := filepath.Join(target.Root, ".env")
	f.remove(f.second, path)
	f.write(files.BasePath(f.second.Home, target.Store)+".pending", "{invalid")
	cancelled, err := checkout.Untrack(f.ctx, f.second, target.Root)
	must(t, err)
	equal(t, len(cancelled), 1)
	equal(t, cancelled[0], path)
	requested, err := operation.DeletionRequested(f.second.Home, target.Store, clock)
	must(t, err)
	equal(t, requested, false)
}
func TestUntrackPreservesSharedCorruptHold(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	f.write(targets[0].Store, "TOKEN=unknown\n")
	f.write(files.BasePath(f.second.Home, targets[0].Store)+".pending", "{invalid")
	_, err := checkout.Untrack(f.ctx, f.second, targets[1].Root)
	must(t, err)
	r := f.push(f.second)
	equal(t, r.Conflicts, 1)
	equal(t, r.Changed, 0)
}
