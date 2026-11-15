//go:build !windows

package fs

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	"golang.org/x/sys/unix"
)

func check(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func setup(t *testing.T) (string, string, string) {
	t.Helper()
	root := t.TempDir()
	checkout := filepath.Join(root, "checkout")
	check(t, os.Mkdir(checkout, 0700))
	store := filepath.Join(root, "store")
	check(t, os.WriteFile(store, []byte("A=secret\n"), 0644)) //nolint:gosec // G306: fixture tests that placement restricts a public store file.

	return root, checkout, store
}

func TestPaths(t *testing.T) {
	_, root, _ := setup(t)
	for _, path := range []string{".g\u200cit/config", "nested/\u200d.env", ".git/config", ".GIT/x", "GIT~1/.env", "nested/ENV~2", ".env~1", "../escape", "con.txt", "a:b", "trailing.", "decomposed-e\u0301"} {
		t.Run(path, func(t *testing.T) {
			if _, err := relative(root, root+"/"+path, true); err == nil {
				t.Fatal("unsafe path accepted")
			}
		})
	}
	for _, path := range []string{"with\u200djoiner/.env", "soft\u00adhyphen/.env"} {
		got, err := relative(root, filepath.Join(root, path), false)
		check(t, err)
		if got != path {
			t.Fatal(got)
		}
	}
}

func TestTemporaryAndPermissions(t *testing.T) {
	_, root, store := setup(t)
	adapter := CreateFsPlacementAdapter(adapters.PlacementCopy, root, "", func() int64 { return 1 })
	dest := filepath.Join(root, "nested", ".env")
	if adapter.Place(store, dest, nil, nil) == nil {
		t.Fatal("missing exclude accepted")
	}
	temp := fmt.Sprintf(".envden-%x", sha256.Sum256([]byte("nested/.env")))
	calls := 0
	prepare := func(path string) error {
		if path != "nested/"+temp {
			t.Fatalf("wrong exclusion %q", path)
		}
		calls++

		return nil
	}
	check(t, adapter.Place(store, dest, prepare, nil))
	check(t, os.WriteFile(filepath.Join(root, "nested", temp), []byte("LEFTOVER=secret"), 0600))
	check(t, adapter.Place(store, dest, prepare, nil))
	if calls != 2 {
		t.Fatal(calls)
	}
	names, err := os.ReadDir(filepath.Join(root, "nested"))
	check(t, err)
	if len(names) != 1 || names[0].Name() != ".env" {
		t.Fatal(names)
	}
	for _, path := range []string{store, dest, filepath.Dir(dest)} {
		st, err := os.Stat(path)
		check(t, err)
		want := os.FileMode(0600)
		if st.IsDir() {
			want = 0700
		}
		if st.Mode().Perm() != want {
			t.Fatal(path, st.Mode())
		}
	}
}

func TestBackupSafetyAndRetention(t *testing.T) {
	root, checkout, store := setup(t)
	dest := filepath.Join(checkout, ".env")
	check(t, os.WriteFile(dest, []byte("keep"), 0600))
	for _, backups := range []string{"", filepath.Join(checkout, "conflicts"), filepath.Join(checkout, "..conflicts")} {
		adapter := CreateFsPlacementAdapter(adapters.PlacementCopy, checkout, backups, func() int64 { return 1 })
		if adapter.Place(store, dest, func(string) error { return nil }, nil) == nil {
			t.Fatal("unsafe backup accepted")
		}
	}
	backups := filepath.Join(root, "conflicts")
	adapter := CreateFsPlacementAdapter(adapters.PlacementCopy, checkout, backups, func() int64 { return 1800000000000 })
	for i := 0; i < 3; i++ {
		check(t, adapter.Place(store, dest, func(string) error { return nil }, nil))
	}
	names, err := os.ReadDir(backups)
	check(t, err)
	if len(names) != 1 || !strings.HasPrefix(names[0].Name(), ".envden-backup-1800000000000-") {
		t.Fatal(names)
	}
	for _, row := range []struct {
		path string
		mode os.FileMode
	}{{backups, 0700}, {filepath.Join(backups, names[0].Name()), 0600}} {
		st, err := os.Stat(row.path)
		check(t, err)
		if st.Mode().Perm() != row.mode {
			t.Fatal(st.Mode())
		}
	}
	old := ".envden-backup-0-11111111-1111-1111-1111-111111111111"
	alias := ".envden-backup-0-33333333-3333-3333-3333-333333333333"
	check(t, os.WriteFile(filepath.Join(backups, old), []byte("old"), 0600))
	check(t, os.Symlink(filepath.Join(backups, old), filepath.Join(backups, alias)))
	check(t, PruneBackups(backups, 4000000000))
	if _, err = os.Stat(filepath.Join(backups, old)); !os.IsNotExist(err) {
		t.Fatal("old backup retained")
	}
	st, err := os.Lstat(filepath.Join(backups, alias))
	check(t, err)
	if st.Mode()&os.ModeSymlink == 0 {
		t.Fatal("symlink removed")
	}
	check(t, PruneBackups(filepath.Join(root, "missing"), 0))
}

func TestDescriptorAnchoringAndIdentity(t *testing.T) {
	root, checkout, _ := setup(t)
	outside := filepath.Join(root, "outside")
	check(t, os.Mkdir(outside, 0700))
	fd, err := openParent(checkout, "nested/.env", true)
	check(t, err)
	defer func() { _ = unix.Close(fd) }()
	check(t, writeAt(fd, ".env", []byte("keep")))
	before, err := identity(fd, ".env")
	check(t, err)
	if writeAt(fd, ".env", []byte("replace")) == nil {
		t.Fatal("exclusive write overwrote file")
	}
	check(t, assertIdentity(fd, ".env", before))
	check(t, os.Rename(filepath.Join(checkout, "nested"), filepath.Join(checkout, "moved")))
	check(t, os.Symlink(outside, filepath.Join(checkout, "nested")))
	check(t, writeAt(fd, "after-swap", []byte("safe")))
	names, err := os.ReadDir(outside)
	check(t, err)
	if len(names) != 0 {
		t.Fatal("write escaped descriptor")
	}
	check(t, unix.Renameat(fd, "after-swap", fd, "renamed"))
	check(t, unix.Unlinkat(fd, ".env", 0))
	if _, err = openParent(checkout, "nested/.env", true); err == nil {
		t.Fatal("linked parent opened")
	}
}

func TestMissingStoreAndLocalUnicode(t *testing.T) {
	_, root, store := setup(t)
	adapter := CreateFsPlacementAdapter(adapters.PlacementCopy, root, "", func() int64 { return 1 })
	dest := filepath.Join(root, "with\u200djoiner", ".env")
	check(t, os.MkdirAll(filepath.Dir(dest), 0700))
	check(t, os.WriteFile(dest, []byte("A=secret\n"), 0600))
	state, err := adapter.Inspect(store, dest)
	check(t, err)
	if state != adapters.PlacementLinked {
		t.Fatal(state)
	}
	check(t, adapter.Remove(&store, dest))
	check(t, os.WriteFile(dest, []byte("RESTORED=yes"), 0600))
	check(t, os.Remove(store))
	state, err = adapter.Inspect(store, dest)
	check(t, err)
	if state != adapters.PlacementDetached {
		t.Fatal(state)
	}
}
