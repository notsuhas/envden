package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/adapters"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"testing"
)

func TestResumeSkipsRecreatedCheckout(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy")
	recreated := f.checkoutB
	recreated.Root = filepath.Join(f.root, "round-recreated")
	must(t, os.MkdirAll(recreated.Root, 0700))
	s := f.state(f.second)
	s.Approved = append(s.Approved, checkout.ApprovalRecord(recreated))
	f.save(f.second, s)
	current := append([]state.Checkout{}, s.Approved...)
	ignored := []string{}
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(root string) (*adapters.Checkout, error) {
		for _, item := range current {
			if item.Root == root {
				return &adapters.Checkout{Root: item.Root, GitDir: item.GitDir, RepoID: item.RepoID, Identity: item.Identity}, nil
			}
		}
		return nil, nil
	}, CaseInsensitive: func(string, bool) (bool, error) { return false, nil }, EnsureIgnored: func(c adapters.Checkout, _ string) error { ignored = append(ignored, c.Root); return nil }})
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	restore := failPlacement(f, &f.second, recreated.Root, false)
	f.pull(f.second)
	equal(t, readValue(files.BasePath(f.second.Home, targets[0].Store)+".pending").present, true)
	restore()
	must(t, os.RemoveAll(recreated.Root))
	must(t, os.MkdirAll(recreated.Root, 0700))
	id := "recloned"
	current[len(current)-1].Identity = &id
	ignored = nil
	f.pull(f.second)
	equal(t, readValue(filepath.Join(recreated.Root, ".env")).present, false)
	for _, root := range ignored {
		if root == recreated.Root {
			t.Fatal("recreated checkout was prepared")
		}
	}
	equal(t, f.read(filepath.Join(targets[0].Root, ".env")), "TOKEN=remote\n")
}
