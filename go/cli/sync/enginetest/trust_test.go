package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTargetTrust(t *testing.T) {
	for _, scenario := range []string{"historical", "untracked-copy", "untracked-link", "untracked-copy-no-yes", "untracked-link-no-yes", "missing-base", "different-base", "untracked-applied", "missing-copy", "local-sides", "removed", "prune-root", "untrack-root", "unapproved-deletion", "unapproved", "retry", "deletion-side", "edit-content", "changed-after-conflict", "merge-retry"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			mode := "copy"
			if scenario == "historical" || strings.HasPrefix(scenario, "untracked-link") {
				mode = "link"
			}
			targets := f.layout(mode)
			target := targets[0]
			s := f.state(f.second)
			path := filepath.Join(target.Root, target.Path)
			edited := "TOKEN=" + scenario + "\n"
			equal(t, target.Mode, mode)
			if scenario == "historical" {
				f.write(f.aStore, edited)
				f.push(f.first)
				f.pull(f.second)
				must(t, os.Remove(path))
				f.write(path, original)
				equal(t, f.pull(f.second).Conflicts, 0)
				equal(t, f.read(target.Store), original)
				equal(t, f.read(path), original)
				return
			}
			if seedTrust(f, scenario, s, target, path, edited) {
				return
			}
			if scenario == "merge-retry" {
				restore := failPlacement(f, &f.second, "", true)
				_, _ = syncer.Pull(f.ctx, f.second, f.opts)
				equal(t, f.pull(f.second).Conflicts, 0)
				equal(t, f.read(path), "TOKEN=local-test-value\nA=local\nB=remote\n")
				restore()
				return
			}
			opts := f.opts
			no := false
			opts.Interactive = &no
			opts.Yes = !strings.HasSuffix(scenario, "no-yes")
			r, err := syncer.Pull(f.ctx, f.second, opts)
			must(t, err)
			records, err := local.ConflictRecords(f.second.Home)
			must(t, err)
			equal(t, len(records), 1)
			record := records[0]
			if strings.HasPrefix(scenario, "untracked") || scenario == "missing-base" {
				equal(t, f.read(target.Store), original)
			}
			if scenario == "local-sides" {
				equal(t, f.read(record.Mine), "TOKEN=store-edit\n")
				equal(t, f.read(record.Server), original)
				found := false
				for _, p := range record.Alternatives {
					if f.read(p) == edited {
						found = true
					}
				}
				if !found {
					t.Fatal("missing alternative")
				}
				if !strings.Contains(strings.Join(r.Reports, "\n"), path) {
					t.Fatal("target not reported")
				}
			}
			if scenario == "deletion-side" {
				must(t, files.WriteBytes(record.File, nil, clock))
			}
			if scenario == "edit-content" {
				f.write(record.File, "TOKEN=edited-resolution\n")
			}
			if scenario == "changed-after-conflict" {
				f.write(target.Store, "TOKEN=later-store\n")
				f.write(path, "TOKEN=later-copy\n")
			}
			if scenario == "prune-root" {
				must(t, os.RemoveAll(target.Root))
				must(t, place.PruneMissingCheckouts(f.ctx, f.second.Home, s, func(string) {}, f.second.Timing))
			} else if scenario == "untrack-root" {
				_, err = checkout.Untrack(f.ctx, f.second, target.Root)
				must(t, err)
			}
			if scenario == "prune-root" || scenario == "untrack-root" {
				records, err = local.ConflictRecords(f.second.Home)
				must(t, err)
				equal(t, len(records), 0)
				return
			}
			if scenario == "removed" {
				must(t, os.RemoveAll(target.Root))
			}
			if strings.HasPrefix(scenario, "unapproved") {
				s.Approved = nil
				s.Links = nil
				f.save(f.second, s)
			}
			if scenario == "retry" {
				restore := failPlacement(f, &f.second, "", false)
				_, err = syncer.ResolveConflict(f.ctx, f.second, syncer.ResolveOptions{File: ".env", Choice: "take-server", Now: clock})
				if err == nil {
					t.Fatal("expected placement failure")
				}
				restore()
			}
			choice := "take-server"
			if strings.HasPrefix(scenario, "edit-") {
				choice = "edit"
			}
			resolved, err := syncer.ResolveConflict(f.ctx, f.second, syncer.ResolveOptions{File: ".env", Choice: choice, Now: clock})
			must(t, err)
			records, err = local.ConflictRecords(f.second.Home)
			must(t, err)
			equal(t, len(records), 0)
			if strings.HasPrefix(scenario, "unapproved") {
				equal(t, f.read(path), edited)
			}
			if scenario == "deletion-side" {
				equal(t, f.read(target.Store), "TOKEN=remote\n")
			}
			if scenario == "edit-content" {
				equal(t, f.read(target.Store), "TOKEN=edited-resolution\n")
			}
			if scenario == "changed-after-conflict" {
				found := false
				for _, p := range resolved.Preserved {
					if f.read(p) == "TOKEN=later-store\n" {
						found = true
					}
				}
				if !found {
					t.Fatal("store backup missing")
				}
				found = false
				for _, m := range resolved.PlacementReports {
					prefix := "Kept your previous "
					if strings.HasPrefix(m, prefix) {
						parts := strings.SplitN(m, " at ", 2)
						if len(parts) == 2 && f.read(parts[1]) == "TOKEN=later-copy\n" {
							found = true
						}
					}
				}
				if !found {
					t.Fatal("copy backup missing")
				}
			}
		})
	}
}
