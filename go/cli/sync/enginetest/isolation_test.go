package enginetest

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/core/adapters"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUnsafeFileDoesNotBlockNeighbour(t *testing.T) {
	for _, published := range []bool{false, true} {
		t.Run(map[bool]string{false: "unpublished", true: "published"}[published], func(t *testing.T) {
			f := newFixture(t)
			f.pull(f.second)
			path := filepath.Join(f.checkoutB.Root, ".env.bad")
			f.write(path, "TOKEN=bad\n")
			f.track(&f.second, f.checkoutB, true, ".env.bad")
			if published {
				f.push(f.second)
			}
			must(t, os.Remove(path))
			must(t, os.Symlink(filepath.Join(f.root, "elsewhere"), path))
			f.write(f.aStore, "TOKEN=neighbour\n")
			f.push(f.first)
			r := f.pull(f.second)
			if r.Conflicts == 0 {
				t.Fatal("expected conflict")
			}
			equal(t, f.read(filepath.Join(f.checkoutB.Root, ".env")), "TOKEN=neighbour\n")
			if !strings.Contains(strings.Join(r.Reports, "\n"), "Could not place") {
				t.Fatal("failure not reported")
			}
			f.push(f.second)
		})
	}
}
func TestKeepMineRestoresRemovedLink(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	f.write(f.aStore, "TOKEN=mine\n")
	must(t, os.Remove(filepath.Join(f.checkout.Root, ".env")))
	b := f.state(f.second).Links[0].Store
	f.write(b, "TOKEN=theirs\n")
	f.push(f.second)
	equal(t, f.pull(f.first).Conflicts, 1)
	f.resolve(f.first, ".env", "keep-mine")
	f.push(f.first)
	f.pull(f.second)
	equal(t, f.read(filepath.Join(f.checkout.Root, ".env")), "TOKEN=mine\n")
	equal(t, f.read(b), "TOKEN=mine\n")
}
func TestNewApprovedCopyReceivesStoreEdit(t *testing.T) {
	for _, initial := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing", true: "present"}[initial], func(t *testing.T) {
			f := newFixture(t)
			copy := f.checkout
			copy.Root = filepath.Join(f.root, "new-copy")
			copy.GitDir = filepath.Join(copy.Root, ".git")
			must(t, os.MkdirAll(copy.Root, 0700))
			if initial {
				f.write(filepath.Join(copy.Root, ".env"), original)
			}
			s := f.state(f.first)
			s.Approved = append(s.Approved, checkout.ApprovalRecord(copy))
			f.save(f.first, s)
			f.repo(&f.first, []adapters.Checkout{f.checkout, copy})
			config, err := json.Marshal(map[string]string{copy.Root: "copy"})
			must(t, err)
			_, err = settings.SetConfig(f.ctx, "placement", string(config), f.first.Home, f.first.Timing, false)
			must(t, err)
			f.write(f.aStore, "TOKEN=store-edit\n")
			equal(t, f.pull(f.first).Conflicts, 0)
			equal(t, f.read(f.aStore), "TOKEN=store-edit\n")
			equal(t, f.read(filepath.Join(copy.Root, ".env")), "TOKEN=store-edit\n")
		})
	}
}
func TestDetachedSaveIsNewestAfterObservedEdit(t *testing.T) {
	f := newFixture(t)
	target := f.layout("link")[0]
	f.write(target.Store, "TOKEN=edited\n")
	equal(t, f.pull(f.second).Conflicts, 0)
	path := filepath.Join(target.Root, ".env")
	must(t, os.Remove(path))
	f.write(path, "TOKEN=detached\n")
	equal(t, f.pull(f.second).Conflicts, 0)
	equal(t, f.read(target.Store), "TOKEN=detached\n")
}
