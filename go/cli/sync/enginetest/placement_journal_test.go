package enginetest

import (
	"errors"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
	pf "github.com/notsuhas/envden/go/core/protocol/files"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEachPlacedFileSurvivesInterruptedPull(t *testing.T) {
	f := newFixture(t)
	c := f.checkout
	c.Root = filepath.Join(f.root, "journal-checkout")
	c.GitDir = filepath.Join(c.Root, ".git")
	c.RepoID = "github.com/test/repo"
	must(t, os.MkdirAll(c.Root, 0700))
	placements := 0
	f.repo(&f.first, []adapters.Checkout{c})
	repo := f.first.Repo
	f.first.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: repo.CheckoutAt, CaseInsensitive: repo.CaseInsensitive, EnsureIgnored: func(adapters.Checkout, string) error {
		placements++
		if placements == 2 {
			return errors.New("interrupted pull")
		}
		return nil
	}})
	context, err := remote.SyncContext(f.ctx, f.first, f.opts, syncLinks(f))
	must(t, err)
	context.State.Approved = []state.Checkout{checkout.ApprovalRecord(c)}
	context.State.Links = []state.Link{}
	f.save(f.first, context.State)
	for _, path := range []string{".env", ".env.local"} {
		store := filepath.Join(f.first.Home, "store", "repo", path)
		id, err := pf.FileID(context.Checkpoint.IdKey, c.RepoID, path)
		must(t, err)
		entry, err := remote.SealUpload(context, c.RepoID, path, id, nil, []byte("KEY=remote\n"))
		must(t, err)
		_, err = reconciliation.ReconcileFile(context, []state.Link{{Root: c.Root, Path: path, Store: store, Mode: "link"}}, store, &entry, nil, nil)
		if path == ".env" {
			must(t, err)
		} else if err == nil || !strings.Contains(err.Error(), "interrupted pull") {
			t.Fatal(err)
		}
	}
	saved := f.state(f.first)
	equal(t, len(saved.Links), 1)
	equal(t, saved.Links[0].Path, ".env")
}
