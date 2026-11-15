package place

import (
	"context"
	fsplacement "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/takeover"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	fake "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"testing"
)

type prepared struct{ adapters.Placement }

func (p prepared) Place(store, dest string, prepare func(string) error, replacing *string) error {
	if prepare == nil {
		prepare = func(string) error { return nil }
	}
	return p.Placement.Place(store, dest, prepare, replacing)
}

func fixture(t *testing.T) (contracts.Adapters, *model.State, adapters.Checkout) {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	checkoutRoot := filepath.Join(root, "checkout")
	if err := os.Mkdir(checkoutRoot, 0700); err != nil {
		t.Fatal(err)
	}
	item := adapters.Checkout{Root: checkoutRoot, RepoID: "host/repo", GitDir: filepath.Join(checkoutRoot, ".git")}
	repo := fake.CreateFakeRepoAdapter(fake.Operations{CheckoutAt: func(path string) (*adapters.Checkout, error) {
		if path == checkoutRoot {
			return &item, nil
		}
		return nil, nil
	}, EnsureIgnored: func(adapters.Checkout, string) error { return nil }, EnvFiles: func(adapters.Checkout, *adapters.EnvFileRules) ([]string, error) { return []string{".env"}, nil }})
	now := func() int64 { return 1800000000000 }
	a := contracts.Adapters{Home: filepath.Join(root, "home"), UserHome: root, Repo: repo, Now: now, Timing: lock.Timing{Now: now}, Placement: func(mode adapters.PlacementMode, path string) adapters.Placement {
		return prepared{fsplacement.CreateFsPlacementAdapter(mode, path, filepath.Join(root, "backups"), now)}
	}}
	return a, model.EmptyState("test"), item
}

func TestTrackLocalOnlyAndUntrack(t *testing.T) {
	a, state, item := fixture(t)
	ctx := context.Background()
	dest := filepath.Join(item.Root, ".env")
	if err := os.WriteFile(dest, []byte("KEY=test\n"), 0600); err != nil {
		t.Fatal(err)
	}
	own, err := LinkCheckout(ctx, a, state, item, LinkOptions{Approve: func(adapters.Checkout) (bool, error) { return true, nil }})
	if err != nil {
		t.Fatal(err)
	}
	if len(own) != 0 || len(state.Links) != 1 || len(state.Approved) != 1 {
		t.Fatalf("state %+v own %+v", state, own)
	}
	stat, err := os.Lstat(dest)
	if err != nil || stat.Mode()&os.ModeSymlink == 0 {
		t.Fatal("file not linked", err)
	}
	if err := links.MarkLocalOnly(ctx, a, state, item.Root, ".env"); err != nil {
		t.Fatal(err)
	}
	stat, err = os.Lstat(dest)
	if err != nil || !stat.Mode().IsRegular() {
		t.Fatal("not a regular local copy", err)
	}
	if !state.Links[0].LocalOnly {
		t.Fatal("local-only not recorded")
	}
	cancelled, err := checkout.Untrack(ctx, a, item.Root)
	if err != nil {
		t.Fatal(err)
	}
	if len(cancelled) != 0 {
		t.Fatal(cancelled)
	}
	saved, err := store.LoadState(a.Home)
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Links) != 0 || len(saved.Approved) != 0 {
		t.Fatal("not untracked")
	}
	content, err := os.ReadFile(dest)
	if err != nil || string(content) != "KEY=test\n" {
		t.Fatal("local content lost", err)
	}
}

func TestTakeoverRestoresOriginalSymlink(t *testing.T) {
	a, state, item := fixture(t)
	ctx := context.Background()
	external := filepath.Join(a.UserHome, "shared.env")
	dest := filepath.Join(item.Root, ".env")
	if err := os.WriteFile(external, []byte("KEY=original\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../shared.env", dest); err != nil {
		t.Fatal(err)
	}
	own, err := LinkCheckout(ctx, a, state, item, LinkOptions{Approve: func(adapters.Checkout) (bool, error) { return true, nil }})
	if err != nil {
		t.Fatal(err)
	}
	if len(own) != 1 || len(state.Links) != 0 {
		t.Fatal("foreign link not offered")
	}
	left, err := takeover.OfferTakeover(ctx, a, state, own, false, func(string) (bool, error) { return true, nil }, func(message string) { t.Log(message) })
	if err != nil {
		t.Fatal(err)
	}
	if len(left) != 0 || len(state.Links) != 1 || state.Links[0].OriginalLink == nil {
		t.Fatal("not adopted")
	}
	if err := store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(state.Links[0].Store, []byte("KEY=changed\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := checkout.Untrack(ctx, a, item.Root); err != nil {
		t.Fatal(err)
	}
	text, err := os.Readlink(dest)
	if err != nil || text != "../shared.env" {
		t.Fatal("original symlink not restored", text, err)
	}
	content, err := os.ReadFile(external)
	if err != nil || string(content) != "KEY=original\n" {
		t.Fatal("external target modified", err)
	}
}

func TestPlacementConflictLeavesLocalFile(t *testing.T) {
	a, state, item := fixture(t)
	ctx := context.Background()
	dest := filepath.Join(item.Root, ".env")
	if err := os.WriteFile(dest, []byte("KEY=first\n"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := LinkCheckout(ctx, a, state, item, LinkOptions{Approve: func(adapters.Checkout) (bool, error) { return true, nil }})
	if err != nil {
		t.Fatal(err)
	}
	stored := state.Links[0].Store
	if err := os.Remove(dest); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dest, []byte("KEY=local\n"), 0600); err != nil {
		t.Fatal(err)
	}
	state.Links = nil
	result, err := links.LinkFile(ctx, a, state, item, a.Placement(adapters.PlacementLink, item.Root), ".env", func(string) (string, error) { return "separate", nil }, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != "done" || len(state.Links) != 1 || !state.Links[0].LocalOnly {
		t.Fatal("separate not recorded")
	}
	old, err := os.ReadFile(stored)
	if err != nil || string(old) != "KEY=first\n" {
		t.Fatal("store modified", err)
	}
}
