package enginetest

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"testing"
)

var layouts = [][]string{{"link"}, {"copy"}, {"link", "copy"}, {"copy", "copy"}, {"link", "link"}, {"link", "copy", "copy"}}

func TestExplicitRemovalAcrossDevices(t *testing.T) {
	for _, modes := range layouts {
		t.Run(fmt.Sprint(modes), func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout(modes...)
			observer := f.checkoutB
			observer.Root = filepath.Join(f.root, "round-observer")
			must(t, os.MkdirAll(observer.Root, 0700))
			s := f.state(f.third)
			s.Approved = []state.Checkout{checkout.ApprovalRecord(observer)}
			f.save(f.third, s)
			f.repo(&f.third, []adapters.Checkout{observer})
			f.pull(f.third)
			path := filepath.Join(observer.Root, ".env")
			equal(t, f.read(path), original)
			r, err := syncer.RemoveFile(f.ctx, f.second, filepath.Join(targets[0].Root, ".env"), syncer.RemoveOptions{Yes: true, Now: clock})
			must(t, err)
			equal(t, r.Publish, "next-push")
			equal(t, readValue(targets[0].Store), value{})
			for _, target := range targets {
				equal(t, readValue(filepath.Join(target.Root, target.Path)), value{})
			}
			found := false
			for _, p := range r.Preserved {
				if f.read(p) == original {
					found = true
				}
			}
			if !found {
				t.Fatal("missing preserved original")
			}
			equal(t, f.read(f.aStore), original)
			equal(t, f.push(f.second).Conflicts, 0)
			f.pull(f.first)
			equal(t, readValue(f.aStore), value{})
			f.pull(f.third)
			equal(t, readValue(path), value{})
			equal(t, f.push(f.second).Changed, 0)
		})
	}
}
func TestAbsenceNeverPublishesDeletion(t *testing.T) {
	for _, modes := range layouts {
		t.Run(fmt.Sprint(modes), func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout(modes...)
			store := targets[0].Store
			for mask := 1; mask <= 7; mask++ {
				if mask&1 != 0 {
					must(t, os.RemoveAll(store))
				}
				for _, target := range targets {
					if mask&2 != 0 {
						must(t, os.RemoveAll(filepath.Join(target.Root, target.Path)))
					}
					if mask&4 != 0 {
						root := ""
						if target.Mode == "copy" {
							root = target.Root
						}
						must(t, os.RemoveAll(files.BasePath(f.second.Home, store, root)))
					}
				}
				equal(t, f.push(f.second).Conflicts, 0)
				equal(t, f.read(store), original)
				for _, target := range targets {
					equal(t, f.read(filepath.Join(target.Root, target.Path)), original)
				}
				f.pull(f.first)
				equal(t, f.read(f.aStore), original)
			}
		})
	}
}
func TestRemovalNeedsConfirmation(t *testing.T) {
	f := newFixture(t)
	_, err := syncer.RemoveFile(f.ctx, f.first, filepath.Join(f.checkout.Root, ".env"), syncer.RemoveOptions{Now: clock})
	if !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
	equal(t, f.read(f.aStore), original)
}
func TestRemovalDiscardsExistingConflict(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=mine\n")
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 1)
	r, err := syncer.RemoveFile(f.ctx, f.second, filepath.Join(f.checkoutB.Root, ".env"), syncer.RemoveOptions{Yes: true, Now: clock})
	must(t, err)
	saved := map[string]bool{}
	for _, p := range r.Preserved {
		saved[f.read(p)] = true
	}
	equal(t, saved["TOKEN=mine\n"], true)
	equal(t, saved["TOKEN=remote\n"], true)
	equal(t, f.push(f.second).Conflicts, 0)
	f.pull(f.first)
	equal(t, readValue(f.aStore), value{})
}
