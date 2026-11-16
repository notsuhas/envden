package enginetest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
)

func TestSupersededAcceptedAttemptIsStale(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	store := f.state(f.second).Links[0].Store
	f.write(store, "TOKEN=remote\n")
	loseResponse(f)
	f.pull(f.first)
	f.write(f.aStore, original)
	f.push(f.first)
	equal(t, f.push(f.second).Changed, 0)
	equal(t, f.read(store), original)
}

func TestPartiallyPlacedVersionSuperseded(t *testing.T) {
	for _, lost := range []bool{false, true} {
		t.Run(map[bool]string{false: "base", true: "lost-base"}[lost], func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout("copy", "copy", "link")
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)
			restore := failIgnored(f, targets[1].Root)
			equal(t, f.pull(f.second).Conflicts, 1)
			restore()

			if lost {
				must(t, os.Remove(files.BasePath(f.second.Home, targets[0].Store)+".entry"))
				_, err := checkout.Untrack(f.ctx, f.second, targets[1].Root)
				must(t, err)
			}

			f.write(f.aStore, original)
			f.push(f.first)
			equal(t, f.push(f.second).Changed, 0)

			for _, target := range targets {
				equal(t, f.read(filepath.Join(target.Root, target.Path)), original)
			}
		})
	}
}

func TestRestoringBytesCancelsRemoval(t *testing.T) {
	for _, mode := range []string{"copy", "link"} {
		t.Run(mode, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout(mode)[0]
			path := filepath.Join(target.Root, ".env")
			f.remove(f.second, path)
			must(t, os.RemoveAll(path))
			f.write(path, original)
			r := f.push(f.second)
			equal(t, r.Conflicts, 0)

			if !strings.Contains(strings.Join(r.Reports, "\n"), "Cancelled removal") {
				t.Fatal("cancellation not reported")
			}

			f.pull(f.first)
			equal(t, f.read(f.aStore), original)
		})
	}
}

func TestLiveResolutionClearsDeletionIntent(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	store := f.state(f.second).Links[0].Store
	f.remove(f.second, filepath.Join(f.checkoutB.Root, ".env"))
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	equal(t, f.push(f.second).Conflicts, 1)
	f.resolve(f.second, ".env", "take-server")
	must(t, os.Remove(store))
	equal(t, f.push(f.second).Changed, 0)
	f.pull(f.first)
	equal(t, f.read(f.aStore), "TOKEN=remote\n")
}

func TestLostUnpublishedLinkRemainsTracked(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkoutB.Root, ".env.new")
	f.write(path, "TOKEN=new\n")
	f.track(&f.second, f.checkoutB, false, ".env.new")
	store := f.state(f.second).Links[0].Store
	must(t, os.Remove(store))
	r := f.push(f.second)
	equal(t, r.Conflicts, 1)

	if !strings.Contains(strings.Join(r.Reports, "\n"), ".env.new: content was lost outside envden") {
		t.Fatal("loss not reported")
	}

	found := false

	for _, link := range f.state(f.second).Links {
		if link.Path == ".env.new" {
			found = true
		}
	}

	equal(t, found, true)
}

func TestRemovingUnpublishedOnlyUntracksLocally(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkoutB.Root, ".env.new")
	f.write(path, "TOKEN=new\n")
	f.track(&f.second, f.checkoutB, true, ".env.new")
	r, err := syncer.RemoveFile(f.ctx, f.second, path, syncer.RemoveOptions{Yes: true, Now: clock})
	must(t, err)
	equal(t, r.Publish, "none")
	equal(t, f.push(f.second).Changed, 0)

	for _, link := range f.state(f.second).Links {
		if link.Path == ".env.new" {
			t.Fatal("still tracked")
		}
	}
}
