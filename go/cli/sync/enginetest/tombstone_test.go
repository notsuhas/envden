package enginetest

import (
	"fmt"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func TestTombstoneReadd(t *testing.T) {
	for _, copy := range []bool{false, true} {
		for _, choice := range []string{"applied", "keep-mine", "take-server", "repair", "untracked-repair"} {
			t.Run(fmt.Sprintf("copy=%v/choice=%s", copy, choice), func(t *testing.T) {
				f := newFixture(t)
				a, c := &f.second, f.checkoutB

				if choice == "applied" {
					a, c = &f.first, f.checkout
				}

				if copy && choice == "untracked-repair" {
					raw := fmt.Sprintf("{%q:%q}", c.Root, "copy")
					_, err := settings.SetConfig(f.ctx, "placement", raw, a.Home, a.Timing, false)
					must(t, err)
				}

				f.remove(f.first, filepath.Join(f.checkout.Root, ".env"))
				f.push(f.first)
				path := filepath.Join(c.Root, ".env")
				f.write(path, "TOKEN=recreated\n")

				if choice != "untracked-repair" {
					f.track(a, c, copy, ".env")
				}

				if choice == "repair" || choice == "untracked-repair" {
					context, err := remote.SyncContext(f.ctx, *a, f.opts, syncLinks(f))
					must(t, err)
					id, err := protocolfiles.FileID(context.Checkpoint.IdKey, c.RepoID, ".env")
					must(t, err)
					must(t, remote.SavePendingRepairs(a.Home, []string{encoding.Base32(id)}, clock))
				}

				r := f.push(*a)

				if choice == "applied" {
					equal(t, r.Kind, "pushed")

					return
				}

				equal(t, r.Kind, "conflict")
				resolve := "keep-mine"

				if choice == "take-server" {
					resolve = choice
				}

				f.resolve(*a, ".env", resolve)
				next := f.push(*a)

				if next.Kind == "conflict" {
					t.Fatal("still conflicted")
				}

				if choice != "take-server" {
					equal(t, next.Kind, "pushed")
				} else {
					equal(t, readValue(path), value{})
				}
			})
		}
	}
}
