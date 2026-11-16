package enginetest

import (
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"github.com/notsuhas/envden/go/core/adapters"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"testing"
)

func TestFailedRemovalNeverRecordsIntent(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	dest := filepath.Join(targets[1].Root, ".env")
	must(t, os.Remove(dest))
	unrelated := filepath.Join(f.root, "unrelated-env")
	f.write(unrelated, "TOKEN=unrelated\n")
	must(t, os.Symlink(unrelated, dest))
	_, err := syncer.RemoveFile(f.ctx, f.second, filepath.Join(targets[0].Root, ".env"), syncer.RemoveOptions{Yes: true, Now: clock})
	if err == nil {
		t.Fatal("expected unsafe target failure")
	}
	requested, err := operation.DeletionRequested(f.second.Home, targets[0].Store, clock)
	must(t, err)
	equal(t, requested, false)
	equal(t, f.read(targets[0].Store), original)
	equal(t, f.read(unrelated), "TOKEN=unrelated\n")
}
func TestRemovalSkipsUnapprovedCopies(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy", "copy")
	repo := f.second.Repo
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(root string) (*adapters.Checkout, error) {
		c, err := repo.CheckoutAt(root)
		if root == targets[1].Root && c != nil {
			id := "changed"
			c.Identity = &id
		}
		return c, err
	}, CaseInsensitive: repo.CaseInsensitive, EnsureIgnored: repo.EnsureIgnored})
	path := filepath.Join(targets[1].Root, ".env")
	r, err := syncer.RemoveFile(f.ctx, f.second, filepath.Join(targets[0].Root, ".env"), syncer.RemoveOptions{Yes: true, Now: clock})
	must(t, err)
	equal(t, len(r.Skipped), 1)
	equal(t, r.Skipped[0], path)
	equal(t, f.read(path), original)
}
