package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/vault/initial"
	"github.com/notsuhas/envden/go/cli/vault/setup"
	"github.com/notsuhas/envden/go/core/adapters"
	"os"
	"path/filepath"
	"testing"
)

func TestCopyPushPreservesEdits(t *testing.T) {
	for _, scenario := range []string{"revert", "unpublished", "two copies"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			target := f.layout("copy")[0]
			c := f.checkoutB
			c.Root = target.Root
			path := filepath.Join(c.Root, ".env")
			if scenario == "unpublished" {
				path = filepath.Join(c.Root, ".env.new")
				f.write(path, "A=1\n")
				f.track(&f.second, c, true, ".env.new")
			} else if scenario == "revert" {
				f.write(path, "A=1\n")
				f.push(f.second)
			} else {
				copy := c
				copy.Root = filepath.Join(f.root, "copy-two")
				f.write(filepath.Join(copy.Root, ".env"), f.read(path))
				f.track(&f.second, copy, true, ".env")
				f.repo(&f.second, []adapters.Checkout{c, copy}, ".env")
				f.pull(f.second)
				f.write(filepath.Join(copy.Root, ".env"), "A=2\n")
				equal(t, f.push(f.second).Kind, "pushed")
				return
			}
			f.write(path, "A=2\n")
			equal(t, f.push(f.second).Kind, "pushed")
			if scenario == "revert" {
				f.write(path, "A=1\n")
				equal(t, f.push(f.second).Kind, "pushed")
				equal(t, f.read(path), "A=1\n")
			}
		})
	}
}
func TestSetupPushLeavesRemoteEdits(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=remote-new\n")
	f.push(f.second)
	resumed, err := setup.SetupVault(f.ctx, f.first, f.setup)
	must(t, err)
	must(t, initial.PushInitialFiles(f.ctx, f.first, resumed.State, nil, nil))
	f.pull(f.first)
	equal(t, f.read(f.aStore), "TOKEN=remote-new\n")
	f.push(f.first)
	f.pull(f.second)
	equal(t, f.read(b), "TOKEN=remote-new\n")
}
func TestNewCopyCannotResurrectTombstone(t *testing.T) {
	f := newFixture(t)
	f.remove(f.first, filepath.Join(f.checkout.Root, ".env"))
	f.push(f.first)
	path := filepath.Join(f.checkoutB.Root, ".env")
	f.write(path, "TOKEN=stale\n")
	f.track(&f.second, f.checkoutB, true, ".env")
	equal(t, f.push(f.second).Kind, "conflict")
	equal(t, f.read(path), "TOKEN=stale\n")
}
func TestAllSkipsRecreatedCheckout(t *testing.T) {
	f := newFixture(t)
	s := f.state(f.second)
	other := f.checkoutB
	other.Root = filepath.Join(f.root, "approved-other")
	other.GitDir = filepath.Join(other.Root, ".git")
	must(t, os.MkdirAll(other.Root, 0700))
	s.Approved = append(s.Approved, checkout.ApprovalRecord(other))
	f.save(f.second, s)
	recreated := f.checkoutB
	id := "recreated"
	recreated.Identity = &id
	f.repo(&f.second, []adapters.Checkout{other, recreated})
	f.pull(f.second)
	equal(t, readValue(filepath.Join(other.Root, ".env")).present, true)
	equal(t, readValue(filepath.Join(f.checkoutB.Root, ".env")).present, false)
}
