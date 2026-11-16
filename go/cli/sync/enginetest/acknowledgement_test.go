package enginetest

import (
	"errors"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/core/adapters"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"testing"
)

func loseResponse(f *fixture) {
	opts := f.opts
	opts.Fetcher = lostFetch
	_, err := syncer.Push(f.ctx, f.second, opts)
	if err == nil {
		f.t.Fatal("expected lost response")
	}
}
func failIgnored(f *fixture, root string) func() {
	original := f.second.Repo
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: original.CheckoutAt, CaseInsensitive: original.CaseInsensitive, EnsureIgnored: func(c adapters.Checkout, path string) error {
		if root == "" || c.Root == root {
			return errors.New("Placement failed")
		}
		return original.EnsureIgnored(c, path)
	}})
	return func() { f.second.Repo = original }
}
func TestAcknowledgementSkippedAncestors(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	originalRepo := f.second.Repo
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(root string) (*adapters.Checkout, error) {
		if root == targets[1].Root {
			return nil, nil
		}
		return originalRepo.CheckoutAt(root)
	}, CaseInsensitive: originalRepo.CaseInsensitive, EnsureIgnored: originalRepo.EnsureIgnored})
	f.write(filepath.Join(targets[0].Root, ".env"), "TOKEN=edited\n")
	loseResponse(f)
	f.second.Repo = originalRepo
	f.push(f.second)
	equal(t, f.serverValue(), value{"TOKEN=edited\n", true})
}
func TestTrackedDetachedRevert(t *testing.T) {
	for _, unpushed := range []bool{false, true} {
		t.Run(map[bool]string{false: "published", true: "unpushed"}[unpushed], func(t *testing.T) {
			f := newFixture(t)
			target := f.layout("link")[0]
			f.write(target.Store, "TOKEN=edited\n")
			if !unpushed {
				f.push(f.second)
			}
			path := filepath.Join(target.Root, ".env")
			must(t, os.Remove(path))
			f.write(path, original)
			r := f.push(f.second)
			if unpushed {
				equal(t, r.Conflicts, 1)
			} else {
				equal(t, f.serverValue(), value{original, true})
			}
		})
	}
}
func TestAcknowledgementPreservesLaterRemoval(t *testing.T) {
	for _, command := range []string{"push", "pull"} {
		t.Run(command, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout("copy")[0]
			path := filepath.Join(target.Root, ".env")
			f.write(path, "TOKEN=edited\n")
			loseResponse(f)
			f.remove(f.second, path)
			if command == "push" {
				f.push(f.second)
			} else {
				f.pull(f.second)
			}
			f.push(f.second)
			equal(t, f.serverValue(), value{})
		})
	}
}
func TestPendingResumePreservesWrittenRevert(t *testing.T) {
	for _, mode := range []string{"copy", "link"} {
		t.Run(mode, func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout(mode, "copy")
			f.write(f.aStore, "TOKEN=edited\n")
			f.push(f.first)
			restore := failIgnored(f, targets[1].Root)
			f.pull(f.second)
			restore()
			path := targets[0].Store
			if mode == "copy" {
				path = filepath.Join(targets[0].Root, ".env")
			}
			f.write(path, original)
			f.push(f.second)
			equal(t, f.serverValue(), value{original, true})
		})
	}
}
func TestMatchingCopyRecordsBeforeFailure(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("link", "copy")
	path := filepath.Join(targets[1].Root, ".env")
	f.write(targets[0].Store, "TOKEN=edited\n")
	f.write(path, "TOKEN=edited\n")
	restore := failIgnored(f, targets[1].Root)
	equal(t, f.pull(f.second).Conflicts, 1)
	restore()
	f.write(path, original)
	equal(t, f.push(f.second).Conflicts, 0)
	equal(t, f.serverValue(), value{original, true})
	equal(t, f.read(path), original)
}
