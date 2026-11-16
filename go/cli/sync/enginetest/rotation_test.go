package enginetest

import (
	"errors"
	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/core/adapters"
	fakeplace "github.com/notsuhas/envden/go/testing/placement"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"testing"
)

func TestSyncRotation(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	must(t, devices.RotateVault(f.ctx, f.first, "master password", clock, nil))
	f.pull(f.second)
	key, err := f.second.Keychain.Get("envden/"+f.second.Home+"/epoch/2", false)
	must(t, err)
	if key == nil {
		t.Fatal("missing epoch 2")
	}
	placement := f.second.Placement
	removals := 0
	f.second.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
		a := placement(mode, root)
		return fakeplace.CreateFakePlacementAdapter(fakeplace.Operations{Mode: mode, Place: a.Place, Inspect: a.Inspect, Remove: func(store *string, path string) error { removals++; return a.Remove(store, path) }})
	}
	f.remove(f.first, filepath.Join(f.checkout.Root, ".env"))
	f.push(f.first)
	f.pull(f.second)
	_, err = os.Stat(b)
	if !os.IsNotExist(err) {
		t.Fatal(err)
	}
	equal(t, removals, 1)
}
func TestInterruptedRotationPlacement(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	before := f.state(f.second)
	extra := f.checkoutB
	extra.Root = filepath.Join(f.root, "extra")
	must(t, os.MkdirAll(extra.Root, 0700))
	before.Approved = append(before.Approved, checkout.ApprovalRecord(extra))
	f.save(f.second, before)
	f.repo(&f.second, []adapters.Checkout{f.checkoutB, extra})
	must(t, devices.RotateVault(f.ctx, f.first, "master password", clock, nil))
	repo := f.second.Repo
	placements := 0
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: repo.CheckoutAt, CaseInsensitive: repo.CaseInsensitive, EnsureIgnored: func(adapters.Checkout, string) error {
		placements++
		if placements == 2 {
			return errors.New("placement crash")
		}
		return nil
	}})
	equal(t, f.pull(f.second).Conflicts, 1)
	key, err := f.second.Keychain.Get("envden/"+f.second.Home+"/epoch/2", false)
	must(t, err)
	if key == nil {
		t.Fatal("missing epoch 2")
	}
	interrupted := f.state(f.second)
	if interrupted.Keyring == before.Keyring || interrupted.Checkpoint == before.Checkpoint {
		t.Fatal("stale checkpoint")
	}
	f.second.Repo = repo
	equal(t, f.pull(f.second).Kind, "pulled")
	if f.state(f.second).Checkpoint == before.Checkpoint {
		t.Fatal("stale checkpoint after resume")
	}
}
