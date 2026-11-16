package enginetest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/repair/finish"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/vault/initial"
	recoveryjoin "github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/core/adapters"
)

func TestRepairAcceptLostAndOfflinePull(t *testing.T) {
	for _, recovered := range []bool{true, false} {
		t.Run(map[bool]string{true: "recovered", false: "lost"}[recovered], func(t *testing.T) {
			f := createConfiguredFixture(t, fixtureOptions{devices: 1, bare: true, password: "old password"})
			current := f.running
			c := f.checkout
			c.RepoID = "github.com/test/repair"
			f.write(filepath.Join(c.Root, ".env"), "VALUE=older\n")
			f.track(&f.first, c, false, ".env")
			state := f.state(f.first)
			must(t, initial.PushInitialFiles(f.ctx, f.first, state, nil, nil))
			store := state.Links[0].Store
			second := f.second
			_, err := recoveryjoin.KitJoin(f.ctx, second, recoveryjoin.JoinOptions{Address: f.kit.Server, VaultID: f.kit.VaultID, SecretKey: f.kit.SecretKey, Password: "old password", Name: "second", Now: clock})
			must(t, err)
			b := c
			b.Root = f.checkoutB.Root
			b.GitDir = filepath.Join(b.Root, ".git")
			f.repo(&second, []adapters.Checkout{b})
			must(t, os.MkdirAll(b.Root, 0700))
			bs := f.state(second)
			bs.Approved = append(bs.Approved, checkout.ApprovalRecord(b))
			f.save(second, bs)
			f.pull(second)
			bStore := f.state(second).Links[0].Store
			must(t, current.Shutdown())
			cloneTree(t, filepath.Join(f.root, "server"), filepath.Join(f.root, "backup"))
			current, _ = f.serve(filepath.Join(f.root, "server"), false)
			point := func(a contracts.Adapters) { s := f.state(a); s.Server.Address = current.URL; f.save(a, s) }
			point(f.first)
			f.write(store, "VALUE=newest\n")
			f.push(f.first)
			must(t, os.RemoveAll(filepath.Join(f.first.Home, "state", "blobs")))

			if !recovered {
				must(t, os.RemoveAll(filepath.Join(second.Home, "state", "blobs")))
			}

			must(t, current.Shutdown())

			if !recovered {
				must(t, os.RemoveAll(filepath.Join(f.root, "backup", "blobs")))
			}

			var token string
			current, token = f.serve(filepath.Join(f.root, "backup"), true)
			point(f.first)
			point(second)
			_, err = repair.UploadRepair(f.ctx, f.first, token, clock, nil)
			must(t, err)
			_, err = repair.UploadRepair(f.ctx, second, token, clock, nil)
			must(t, err)
			result, err := finish.FinishRepair(f.ctx, f.first, finish.Options{Token: token, Password: "old password", AcceptLost: true, Now: clock})
			must(t, err)
			equal(t, result.Kind, "finished")
			want := "lost;"

			if recovered {
				want = "recovered from"
			}

			if result.Report == nil || !strings.Contains(*result.Report, want) {
				t.Fatal(result.Report)
			}

			f.write(store, "VALUE=after-repair\n")
			f.push(f.first)
			reports := []string{}
			opts := f.opts
			opts.Report = func(v string) { reports = append(reports, v) }
			pulled, err := syncer.Pull(f.ctx, second, opts)
			must(t, err)
			equal(t, pulled.Conflicts, 1)
			equal(t, f.read(bStore), "VALUE=older\n")

			if !strings.Contains(strings.Join(reports, "\n"), "Repair changed file") {
				t.Fatal(reports)
			}

			must(t, current.Shutdown())
		})
	}
}
