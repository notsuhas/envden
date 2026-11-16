package enginetest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/links"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
)

func TestRestorePreservesCopyMineAndRealServer(t *testing.T) {
	f := newFixture(t)
	target := f.layout("copy")[0]
	f.write(f.aStore, "TOKEN=server-edit\n")
	f.push(f.first)
	must(t, os.Remove(target.Store))
	path := filepath.Join(target.Root, ".env")
	f.write(path, "TOKEN=copy-edit\n")
	equal(t, f.pull(f.second).Conflicts, 1)
	records, err := local.ConflictRecords(f.second.Home)
	must(t, err)
	equal(t, len(records), 1)
	equal(t, f.read(records[0].Mine), "TOKEN=copy-edit\n")
	equal(t, f.read(records[0].Server), "TOKEN=server-edit\n")
	f.resolve(f.second, ".env", "keep-mine")
	equal(t, f.read(path), "TOKEN=copy-edit\n")
}

func TestUnpublishedConflictCannotTakeNonexistentServer(t *testing.T) {
	f := newFixture(t)
	target := f.layout("copy")[0]
	c := f.checkoutB
	c.Root = target.Root
	path := filepath.Join(c.Root, ".env.new")
	f.write(path, "A=1\n")
	f.track(&f.second, c, true, ".env.new")
	f.pull(f.second)
	store := ""

	for _, link := range f.state(f.second).Links {
		if link.Path == ".env.new" {
			store = link.Store
		}
	}

	f.write(store, "A=store\n")
	f.write(path, "A=copy\n")
	equal(t, f.pull(f.second).Conflicts, 1)
	records, err := local.ConflictRecords(f.second.Home)
	must(t, err)
	equal(t, len(records), 1)
	equal(t, records[0].Deleted, false)
	_, err = syncer.ResolveConflict(f.ctx, f.second, syncer.ResolveOptions{File: ".env.new", Choice: "take-server", Now: clock})
	if err == nil || !strings.Contains(err.Error(), "No server entry") {
		t.Fatal(err)
	}

	equal(t, f.read(store), "A=store\n")
	equal(t, f.read(path), "A=copy\n")
}

func TestResolveLeavesLaterLocalOnlyTarget(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("link", "link")
	store := targets[0].Store
	kept := filepath.Join(targets[1].Root, ".env")
	f.write(store, "TOKEN=mine\n")
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	must(t, links.MarkLocalOnly(f.ctx, f.second, f.state(f.second), targets[1].Root, ".env"))
	f.resolve(f.second, ".env", "take-server")
	info, err := os.Lstat(kept)
	must(t, err)
	equal(t, info.Mode()&os.ModeSymlink != 0, false)
	equal(t, f.read(kept), "TOKEN=mine\n")
	equal(t, f.read(filepath.Join(targets[0].Root, ".env")), "TOKEN=remote\n")
}
