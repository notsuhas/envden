package enginetest

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	placementfs "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	"github.com/notsuhas/envden/go/cli/state/lock"
	state "github.com/notsuhas/envden/go/cli/state/model"
	storepath "github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/core/adapters"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

func localFixture(t *testing.T) *fixture {
	root, err := filepath.EvalSymlinks(t.TempDir())
	must(t, err)
	f := &fixture{t: t, ctx: context.Background(), root: root}
	home := filepath.Join(root, "home")
	f.first = contracts.Adapters{Home: home, UserHome: root, Now: clock, Timing: lock.Timing{Now: clock}}
	f.first.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
		return prepared{placementfs.CreateFsPlacementAdapter(mode, root, filepath.Join(home, "conflicts"), clock)}
	}
	f.checkout = adapters.Checkout{Root: filepath.Join(root, "checkout"), GitDir: filepath.Join(root, "checkout", ".git"), RepoID: "host/repo"}
	must(t, os.MkdirAll(f.checkout.Root, 0700))
	f.repo(&f.first, []adapters.Checkout{f.checkout}, ".env")

	return f
}

func TestPlacementApprovalAndDetachedFiles(t *testing.T) {
	f := localFixture(t)
	a := f.first
	s := state.EmptyState("test")
	path := filepath.Join(f.checkout.Root, ".env")
	excludes := 0
	repo := a.Repo
	a.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: repo.CheckoutAt, EnvFiles: repo.EnvFiles, CaseInsensitive: repo.CaseInsensitive, EnsureIgnored: func(adapters.Checkout, string) error { excludes++; return nil }})
	f.write(path, "PORT=3000\n")
	opts := place.LinkOptions{Approve: func(adapters.Checkout) (bool, error) { return false, nil }}
	_, err := place.LinkCheckout(f.ctx, a, s, f.checkout, opts)
	must(t, err)
	equal(t, len(s.Links), 0)
	opts.Approve = func(adapters.Checkout) (bool, error) { return true, nil }
	_, err = place.LinkCheckout(f.ctx, a, s, f.checkout, opts)
	must(t, err)
	equal(t, excludes, 1)
	link := s.Links[0]
	must(t, os.Remove(path))
	f.write(path, "PORT=3000\n")
	opts.Approve = func(adapters.Checkout) (bool, error) { return false, errors.New("Repeated approval") }
	_, err = place.LinkCheckout(f.ctx, a, s, f.checkout, opts)
	must(t, err)
	status, err := a.Placement("link", f.checkout.Root).Inspect(link.Store, path)
	must(t, err)
	equal(t, status, adapters.PlacementLinked)
	f.write(path, "PORT=4000\n")
	opts.Approve = func(adapters.Checkout) (bool, error) { return true, nil }
	_, err = place.LinkCheckout(f.ctx, a, s, f.checkout, opts)
	must(t, err)
	equal(t, f.read(link.Store), "PORT=3000\n")
	must(t, links.MarkLocalOnly(f.ctx, a, s, f.checkout.Root, ".env"))
	equal(t, s.Links[0].LocalOnly, true)
	equal(t, f.read(path), "PORT=4000\n")
}

func TestLinkIntoDeletedStoreIsRemoved(t *testing.T) {
	f := localFixture(t)
	path := filepath.Join(f.checkout.Root, ".env")
	must(t, os.MkdirAll(f.checkout.Root, 0700))
	stored, err := storepath.StorePath(f.first.Home, f.checkout.RepoID, ".env")
	must(t, err)
	must(t, os.Symlink(stored, path))
	s := state.EmptyState("test")
	_, err = place.LinkCheckout(f.ctx, f.first, s, f.checkout, place.LinkOptions{Approve: func(adapters.Checkout) (bool, error) { return true, nil }})
	must(t, err)
	equal(t, len(s.Links), 0)
	_, err = os.Lstat(path)

	if !os.IsNotExist(err) {
		t.Fatal(err)
	}
}

func TestContainerOfferOncePerCheckout(t *testing.T) {
	f := localFixture(t)
	f.write(filepath.Join(f.checkout.Root, ".env"), "A=1")
	f.write(filepath.Join(f.checkout.Root, "Dockerfile"), "FROM scratch")
	offered := 0
	ask := func(string) (bool, error) { offered++; return false, nil }

	for range 2 {
		mode, err := checkout.CheckoutPlacement(f.ctx, f.first, f.checkout.Root, false, ask, true)
		must(t, err)
		equal(t, mode, adapters.PlacementLink)
	}

	equal(t, offered, 1)
}
