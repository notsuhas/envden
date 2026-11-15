package placement

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func require(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func contents(t *testing.T, path, want string) {
	t.Helper()
	b, err := os.ReadFile(path)
	require(t, err)
	if string(b) != want {
		t.Fatalf("got %q, want %q", b, want)
	}
}

func state(t *testing.T, adapter adapters.Placement, store, dest string, want adapters.PlacementState) {
	t.Helper()
	got, err := adapter.Inspect(store, dest)
	require(t, err)
	if got != want {
		t.Fatalf("state %q, want %q", got, want)
	}
}

func PlacementContract(t *testing.T, factory func(root, backups string) adapters.Placement) {
	t.Run("placement can be inspected, repeated and removed", func(t *testing.T) {
		root := t.TempDir()
		adapter := factory(root, "")
		store := filepath.Join(root, "store")
		dest := filepath.Join(root, "nested", ".env")
		require(t, os.WriteFile(store, []byte("A=1\n"), 0600))
		supported, err := adapter.Supported(root)
		require(t, err)
		if !supported {
			if adapter.Place(store, dest, func(string) error { return nil }, nil) == nil {
				t.Fatal("unsupported placement succeeded")
			}

			return
		}
		state(t, adapter, store, dest, adapters.PlacementMissing)
		for i := 0; i < 2; i++ {
			require(t, adapter.Place(store, dest, func(string) error { return nil }, nil))
			contents(t, dest, "A=1\n")
			state(t, adapter, store, dest, adapters.PlacementLinked)
		}
		require(t, adapter.Remove(&store, dest))
		require(t, adapter.Remove(&store, dest))
		state(t, adapter, store, dest, adapters.PlacementMissing)
	})
	t.Run("refuses unrelated links and linked parents and backs up overwrites", func(t *testing.T) {
		root := t.TempDir()
		checkout := filepath.Join(root, "checkout")
		backups := filepath.Join(root, "backups")
		require(t, os.Mkdir(checkout, 0700))
		adapter := factory(checkout, backups)
		store := filepath.Join(root, "store")
		unrelated := filepath.Join(root, "unrelated")
		dest := filepath.Join(checkout, ".env")
		require(t, os.WriteFile(store, []byte("NEW=1"), 0600))
		require(t, os.WriteFile(unrelated, []byte("KEEP=1"), 0600))
		require(t, os.Symlink(unrelated, dest))
		prepare := func(string) error { return nil }
		if adapter.Place(store, dest, prepare, nil) == nil {
			t.Fatal("unrelated symlink accepted")
		}
		other := filepath.Join(root, "other")
		if adapter.Place(store, dest, prepare, &other) == nil {
			t.Fatal("wrong replacing link accepted")
		}
		contents(t, unrelated, "KEEP=1")
		require(t, adapter.Place(store, dest, prepare, &unrelated))
		state(t, adapter, store, dest, adapters.PlacementLinked)
		contents(t, dest, "NEW=1")
		contents(t, unrelated, "KEEP=1")
		require(t, os.Remove(dest))
		require(t, os.Symlink(root, filepath.Join(checkout, "parent")))
		if adapter.Place(store, filepath.Join(checkout, "parent", ".env"), prepare, nil) == nil {
			t.Fatal("linked parent accepted")
		}
		require(t, os.WriteFile(dest, []byte("OLD=1"), 0600))
		require(t, adapter.Place(store, dest, prepare, nil))
		names, err := os.ReadDir(backups)
		require(t, err)
		if len(names) != 1 {
			t.Fatalf("got %d backups", len(names))
		}
		contents(t, filepath.Join(backups, names[0].Name()), "OLD=1")
	})
	t.Run("inspection distinguishes equal copies and changed files", func(t *testing.T) {
		root := t.TempDir()
		adapter := factory(root, "")
		store := filepath.Join(root, "store")
		dest := filepath.Join(root, ".env")
		require(t, os.WriteFile(store, []byte("A=1\n"), 0600))
		require(t, os.WriteFile(dest, []byte("A=1\n"), 0600))
		want := adapters.PlacementLinked
		if adapter.Mode() == adapters.PlacementLink {
			want = adapters.PlacementRelinkable
		}
		state(t, adapter, store, dest, want)
		require(t, os.WriteFile(dest, []byte("A=2\n"), 0600))
		state(t, adapter, store, dest, adapters.PlacementDetached)
	})
	t.Run("rejects paths outside checkout and directory destinations", func(t *testing.T) {
		root := t.TempDir()
		checkout := filepath.Join(root, "checkout")
		require(t, os.Mkdir(checkout, 0700))
		adapter := factory(checkout, "")
		store := filepath.Join(root, "store")
		require(t, os.WriteFile(store, []byte("A=1\n"), 0600))
		outside := filepath.Join(root, "outside")
		if adapter.Place(store, outside, func(string) error { return nil }, nil) == nil {
			t.Fatal("outside placement accepted")
		}
		if _, err := adapter.Inspect(store, outside); err == nil {
			t.Fatal("outside inspect accepted")
		}
		if adapter.Remove(&store, outside) == nil {
			t.Fatal("outside removal accepted")
		}
		dest := filepath.Join(checkout, ".env")
		require(t, os.Mkdir(dest, 0700))
		if adapter.Place(store, dest, func(string) error { return nil }, nil) == nil {
			t.Fatal("directory overwritten")
		}
	})
}
