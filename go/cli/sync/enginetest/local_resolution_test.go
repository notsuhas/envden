package enginetest

import (
	"context"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	cm "github.com/notsuhas/envden/go/cli/model/conflicts"
	localstate "github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/lock"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSyncLocksNestAndRelease(t *testing.T) {
	home := t.TempDir()
	timing := lock.Timing{Now: clock}
	nested := false
	must(t, lock.WithStateLock(context.Background(), home, timing, func(ctx context.Context) error {
		return lock.WithStateLock(ctx, home, timing, func(context.Context) error { nested = true; return nil })
	}))
	equal(t, nested, true)
	must(t, lock.WithStateLock(context.Background(), home, timing, func(context.Context) error { return nil }))
}
func TestResolveRecordedSnapshots(t *testing.T) {
	for _, choice := range []string{"keep-mine", "take-server", "edit"} {
		t.Run(choice, func(t *testing.T) {
			f := newFixture(t)
			a := f.first
			c := adapters.Checkout{Root: filepath.Join(f.root, "resolution-checkout"), RepoID: "host/repo"}
			c.GitDir = filepath.Join(c.Root, ".git")
			f.repo(&a, []adapters.Checkout{c})
			stored := filepath.Join(a.Home, "store", ".env")
			file := filepath.Join(a.Home, "conflicts", "edited")
			server := file + ".server"
			base := filepath.Join(a.Home, "base", "one")
			f.write(stored, "KEY=mine\n")
			f.write(file, "KEY=edited\n")
			f.write(server, "KEY=remote\n")
			f.write(file+".mine", "KEY=mine\n")
			s := state.EmptyState("test")
			s.Approved = append(s.Approved, checkout.ApprovalRecord(c))
			target := state.Link{Root: c.Root, Path: ".env", Store: stored, Mode: "copy"}
			s.Links = append(s.Links, target)
			f.save(a, s)
			must(t, local.SaveConflicts(a.Home, []cm.Record{{Store: stored, Root: c.Root, Path: ".env", Mode: "copy", File: file, Server: server, Remote: server, Mine: file + ".mine", Base: base, Targets: []state.Link{target}, Alternatives: []string{}}}, clock))
			destination := filepath.Join(c.Root, ".env")
			f.write(destination, "unrelated checkout bytes")
			r, err := syncer.ResolveConflict(f.ctx, a, syncer.ResolveOptions{Choice: choice, Now: func() int64 { return 10 }})
			if choice == "take-server" {
				if err == nil || !strings.Contains(err.Error(), "No server entry") {
					t.Fatal(err)
				}
				equal(t, f.read(stored), "KEY=mine\n")
				return
			}
			must(t, err)
			equal(t, r.Backups, filepath.Join(a.Home, "conflicts", "backups"))
			entries, err := os.ReadDir(r.Backups)
			must(t, err)
			found := false
			for _, entry := range entries {
				if f.read(filepath.Join(r.Backups, entry.Name())) == "unrelated checkout bytes" {
					found = true
				}
			}
			equal(t, found, true)
			want := "KEY=edited\n"
			if choice == "keep-mine" {
				want = "KEY=mine\n"
			}
			equal(t, f.read(stored), want)
			equal(t, readValue(base).present, false)
			records, err := local.ConflictRecords(a.Home)
			must(t, err)
			equal(t, len(records), 0)
			for _, path := range []string{file, server, file + ".mine"} {
				equal(t, readValue(path).present, false)
			}
		})
	}
}
func TestCancelledDetachedPromptAbortsPush(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkout.Root, ".env")
	f.write(f.aStore, "TOKEN=store-edit\n")
	must(t, os.Remove(path))
	f.write(path, "TOKEN=detached\n")
	opts := f.opts
	yes := true
	opts.Interactive = &yes
	opts.Choose = func(string) (string, error) { return "", localstate.PromptCancelled() }
	_, err := syncer.Push(f.ctx, f.first, opts)
	if !e.Is(err, e.InvalidInput) {
		t.Fatal(err)
	}
}
