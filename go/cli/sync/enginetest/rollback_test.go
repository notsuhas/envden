package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links/checkout"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/server"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

func cloneTree(t *testing.T, from, to string) {
	t.Helper()
	must(t, filepath.WalkDir(from, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(from, path)
		if err != nil {
			return err
		}
		dest := filepath.Join(to, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.IsDir() {
			return os.MkdirAll(dest, info.Mode().Perm())
		}
		if info.Mode()&os.ModeSymlink != 0 {
			target, err := os.Readlink(path)
			if err != nil {
				return err
			}
			return os.Symlink(target, dest)
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(dest, raw, info.Mode().Perm())
	}))
}
func TestSyncRollback(t *testing.T) {
	f := newFixture(t)
	snapshot := filepath.Join(f.root, "snapshot")
	cloneTree(t, filepath.Join(f.root, "server"), snapshot)
	f.write(f.aStore, "TOKEN=restored\n")
	f.push(f.first)
	port := 0
	old, err := server.Serve(server.ServeOptions{DataDir: snapshot, Port: &port, Now: clock, Stdout: io.Discard, Stderr: io.Discard})
	must(t, err)
	defer func() { must(t, old.Shutdown()) }()
	s := f.state(f.first)
	address := s.Server.Address
	s.Server.Address = old.URL
	f.save(f.first, s)
	_, err = syncer.Pull(f.ctx, f.first, f.opts)
	if !e.Is(err, e.Rollback) {
		t.Fatal(err)
	}
	s.Server.Address = address
	f.save(f.first, s)
}
func TestInterruptedPlacementKeepsRollbackFloor(t *testing.T) {
	f := newFixture(t)
	snapshot := filepath.Join(f.root, "snapshot")
	cloneTree(t, filepath.Join(f.root, "server"), snapshot)
	f.write(f.aStore, "TOKEN=new-version\n")
	f.push(f.first)
	extra := f.checkoutB
	extra.Root = filepath.Join(f.root, "extra-checkout")
	extra.GitDir = filepath.Join(extra.Root, ".git")
	must(t, os.MkdirAll(extra.Root, 0700))
	s := f.state(f.second)
	s.Approved = append(s.Approved, checkout.ApprovalRecord(extra))
	f.save(f.second, s)
	f.repo(&f.second, []adapters.Checkout{f.checkoutB, extra})
	restore := failPlacement(f, &f.second, extra.Root, false)
	equal(t, f.pull(f.second).Conflicts, 1)
	equal(t, f.read(filepath.Join(f.checkoutB.Root, ".env")), "TOKEN=new-version\n")
	restore()
	port := 0
	old, err := server.Serve(server.ServeOptions{DataDir: snapshot, Port: &port, Now: clock, Stdout: io.Discard, Stderr: io.Discard})
	must(t, err)
	stored := f.state(f.second)
	address := stored.Server.Address
	stored.Server.Address = old.URL
	f.save(f.second, stored)
	_, err = syncer.Pull(f.ctx, f.second, f.opts)
	if !e.Is(err, e.Rollback) {
		t.Fatal(err)
	}
	equal(t, f.read(filepath.Join(f.checkoutB.Root, ".env")), "TOKEN=new-version\n")
	stored.Server.Address = address
	f.save(f.second, stored)
	must(t, old.Shutdown())
	f.pull(f.second)
	equal(t, f.read(filepath.Join(extra.Root, ".env")), "TOKEN=new-version\n")
}
