package enginetest

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func TestMissingStoreRestoresPublishedBytes(t *testing.T) {
	for _, mode := range []string{"link", "copy"} {
		t.Run(mode, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout(mode)[0]
			must(t, os.Remove(target.Store))
			equal(t, f.pull(f.second).Conflicts, 0)
			equal(t, f.read(target.Store), original)
			equal(t, f.read(filepath.Join(target.Root, ".env")), original)
			equal(t, f.push(f.second).Changed, 0)
		})
	}
}

func TestLostResponseAcknowledgesOwnEntry(t *testing.T) {
	for _, mode := range []string{"link", "copy"} {
		t.Run(mode, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout(mode)[0]
			path := target.Store

			if mode == "copy" {
				path = filepath.Join(target.Root, ".env")
			}

			f.write(path, "TOKEN=e1\n")
			opts := f.opts
			opts.Fetcher = lostFetch
			_, err := syncer.Push(f.ctx, f.second, opts)
			if err == nil {
				t.Fatal("expected lost response")
			}

			f.write(path, "TOKEN=e2\n")
			equal(t, f.push(f.second).Conflicts, 0)
			f.pull(f.first)
			equal(t, f.read(f.aStore), "TOKEN=e2\n")
		})
	}
}

func TestUntrackingConflictingCheckout(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=mine\n")
	f.write(f.aStore, "TOKEN=theirs\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	_, err := checkout.Untrack(f.ctx, f.second, f.checkoutB.Root)
	must(t, err)
	records, err := local.ConflictRecords(f.second.Home)
	must(t, err)
	equal(t, len(records), 0)
}

func TestDetachedOldContentAdopted(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=new\n")
	f.push(f.second)
	path := filepath.Join(f.checkoutB.Root, ".env")
	must(t, os.Remove(path))
	f.write(path, original)
	equal(t, f.pull(f.second).Conflicts, 0)
	equal(t, f.read(path), original)
}

func TestUntrackingDivergentCopy(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "link")
	path := filepath.Join(targets[0].Root, ".env")
	f.write(path, "TOKEN=mine\n")
	f.write(f.aStore, "TOKEN=theirs\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	_, err := checkout.Untrack(f.ctx, f.second, targets[0].Root)
	must(t, err)
	equal(t, f.pull(f.second).Conflicts, 0)
	equal(t, f.read(targets[1].Store), "TOKEN=theirs\n")
	equal(t, f.read(path), "TOKEN=mine\n")
}

func TestMissingStoreWithConflictingCopy(t *testing.T) {
	f := newFixture(t)
	target := f.layout("copy")[0]
	path := filepath.Join(target.Root, ".env")
	f.write(path, "TOKEN=mine\n")
	must(t, os.Remove(target.Store))
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	equal(t, f.read(target.Store), "TOKEN=remote\n")
	equal(t, f.read(path), "TOKEN=mine\n")
}

func TestRevertAfterConflict(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=mine\n")
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	f.write(b, original)
	equal(t, f.pull(f.second).Conflicts, 1)
	equal(t, f.read(b), original)
}

func TestMissingConflictFileCannotDelete(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=mine\n")
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	f.pull(f.second)
	records, err := local.ConflictRecords(f.second.Home)
	must(t, err)
	equal(t, len(records), 1)
	must(t, os.Remove(records[0].File))
	_, err = syncer.ResolveConflict(f.ctx, f.second, syncer.ResolveOptions{File: ".env", Choice: "edit", Now: clock})

	if !envdenerrors.Is(err, envdenerrors.InvalidInput) {
		t.Fatal(err)
	}

	equal(t, f.read(b), "TOKEN=mine\n")
}

func TestMissingUnpublishedStoreKeepsCopy(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkoutB.Root, ".env.new")
	f.write(path, "TOKEN=unpublished\n")
	f.track(&f.second, f.checkoutB, true, ".env.new")
	target := f.state(f.second).Links[0]
	must(t, os.Remove(target.Store))
	equal(t, f.pull(f.second).Conflicts, 1)
	equal(t, f.read(path), "TOKEN=unpublished\n")
}
