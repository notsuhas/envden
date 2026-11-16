package enginetest

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/links/checkout"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

func TestSelectionRefusesChangedRemotesAndPrefixSiblings(t *testing.T) {
	f := localFixture(t)
	c := f.checkout
	s := state.EmptyState("test")
	s.Approved = append(s.Approved, checkout.ApprovalRecord(c))
	f.first.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(string) (*adapters.Checkout, error) { return &c, nil }, CaseInsensitive: func(string, bool) (bool, error) { return false, nil }})
	opts := syncmodel.Options{Now: clock, Cwd: filepath.Join(c.Root, "nested")}

	for _, path := range []string{opts.Cwd, filepath.Join(c.Root, "..nested")} {
		opts.Cwd = path
		repos, err := reconcile.SelectedRepos(f.first, s, opts, syncLinks(f), nil)
		must(t, err)
		equal(t, len(repos), 1)
		equal(t, repos[c.RepoID], true)
	}

	opts.Cwd = c.Root + "-other"
	_, err := reconcile.SelectedRepos(f.first, s, opts, syncLinks(f), nil)

	if !envdenerrors.Is(err, envdenerrors.Unauthorized) {
		t.Fatal(err)
	}

	changed := c
	changed.RepoID = "changed"
	f.first.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(string) (*adapters.Checkout, error) { return &changed, nil }, CaseInsensitive: func(string, bool) (bool, error) { return false, nil }})
	opts.All = true
	_, err = reconcile.SelectedRepos(f.first, s, opts, syncLinks(f), nil)

	if !envdenerrors.Is(err, envdenerrors.Conflict) {
		t.Fatal(err)
	}
}

func TestAllSkipsRecreatedCheckoutWithNotice(t *testing.T) {
	f := localFixture(t)
	c := f.checkout
	old, current := "old", "new"
	c.Identity = &old
	s := state.EmptyState("test")
	s.Approved = append(s.Approved, checkout.ApprovalRecord(c))
	c.Identity = &current
	f.first.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(string) (*adapters.Checkout, error) { return &c, nil }})
	reports := []string{}
	repos, err := reconcile.SelectedRepos(f.first, s, syncmodel.Options{All: true, Report: func(v string) { reports = append(reports, v) }}, syncLinks(f), nil)
	must(t, err)
	equal(t, len(repos), 0)

	if !strings.Contains(strings.Join(reports, " "), "envden track") {
		t.Fatal(reports)
	}
}

func TestBackupRetentionRecognizesNamesOnly(t *testing.T) {
	f := localFixture(t)
	directory := filepath.Join(f.first.Home, "conflicts", "backups")
	old := "0000000000001_12345678-abcd-4000-8000-000000000000"
	recent := "0002592000001_12345678-abcd-4000-8000-000000000000"
	f.write(filepath.Join(directory, old), "old")
	f.write(filepath.Join(directory, recent), "new")
	f.write(filepath.Join(directory, "unrecognized"), "keep")
	must(t, local.PruneBackups(f.first.Home, 2592000001))
	equal(t, readValue(filepath.Join(directory, old)).present, false)
	equal(t, readValue(filepath.Join(directory, recent)).present, true)
	equal(t, readValue(filepath.Join(directory, "unrecognized")).present, true)
}
