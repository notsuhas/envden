package files

import (
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicWrite(t *testing.T) {
	root := t.TempDir()
	now := func() int64 { return 1800000000000 }
	if err := os.Chmod(root, 0755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "target")
	link := filepath.Join(root, "link")
	if err := AtomicWrite(target, []byte("original"), now); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if _, err := OptionalRead(link); !errors.Is(err, errors.InvalidData) {
		t.Fatal(err)
	}
	if err := AtomicWrite(link, []byte("new"), now); err != nil {
		t.Fatal(err)
	}
	for p, want := range map[string]string{target: "original", link: "new"} {
		b, err := os.ReadFile(p)
		if err != nil || string(b) != want {
			t.Fatal(string(b), err)
		}
	}
	info, _ := os.Stat(root)
	if info.Mode().Perm() != 0755 {
		t.Fatal(info.Mode())
	}
	entries, _ := os.ReadDir(root)
	if len(entries) != 2 {
		t.Fatal(entries)
	}
}
func TestUnsafeDirectoryAndCanonicalLocation(t *testing.T) {
	root := t.TempDir()
	real := filepath.Join(root, "real")
	os.Mkdir(real, 0700)
	link := filepath.Join(root, "link")
	os.Symlink(real, link)
	if err := AtomicWrite(filepath.Join(link, "state"), []byte("data"), func() int64 { return 0 }); !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}
	canonical, _ := filepath.EvalSymlinks(real)
	got, err := RealLocation(filepath.Join(link, "missing", "child"))
	if err != nil || got != filepath.Join(canonical, "missing", "child") {
		t.Fatal(got, err)
	}
}
