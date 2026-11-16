package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"path/filepath"
	"testing"
)

func TestSyncFirstRun(t *testing.T) {
	f := newFixture(t)
	c := f.checkout
	c.Root = filepath.Join(f.root, "checkout-c")
	c.GitDir = filepath.Join(c.Root, ".git")
	f.repo(&f.third, []adapters.Checkout{c})
	s := f.state(f.third)
	s.Approved = append(s.Approved, checkout.ApprovalRecord(c))
	f.save(f.third, s)
	path := filepath.Join(c.Root, ".env")
	f.write(path, "TOKEN=third-local\n")
	choices := 0
	_, err := syncer.FirstRun(f.ctx, f.third, f.opts, func(string) (string, error) { choices++; return "take-server", nil })
	must(t, err)
	equal(t, choices, 1)
	equal(t, f.read(path), original)
	store := f.state(f.third).Links[0].Store
	for _, choice := range []string{"keep-mine", "merge"} {
		f.write(store, "TOKEN=third-local\n")
		_, err = syncer.FirstRun(f.ctx, f.third, f.opts, func(string) (string, error) { return choice, nil })
		must(t, err)
		equal(t, f.read(store), "TOKEN=third-local\n")
	}
}
func TestTrackingAfterJoinHasNoInventedBase(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkoutB.Root, ".env")
	f.write(path, "TOKEN=mine\n")
	f.track(&f.second, f.checkoutB, false, ".env")
	equal(t, f.pull(f.second).Conflicts, 1)
}
func TestInvalidFirstRunContinuesOtherFiles(t *testing.T) {
	f := newFixture(t)
	f.write(filepath.Join(f.checkout.Root, ".env.good"), "GOOD=remote\n")
	f.track(&f.first, f.checkout, false, ".env.good")
	f.push(f.first)
	path := filepath.Join(f.checkoutB.Root, ".env")
	f.write(path, "TOKEN=mine\n")
	opts := f.opts
	yes := true
	opts.Interactive = &yes
	r, err := syncer.FirstRun(f.ctx, f.second, opts, func(string) (string, error) { return "", e.New(e.InvalidInput, "Unknown first-run choice") })
	must(t, err)
	equal(t, r.Conflicts, 1)
	equal(t, f.read(path), "TOKEN=mine\n")
	equal(t, f.read(filepath.Join(f.checkoutB.Root, ".env.good")), "GOOD=remote\n")
}
