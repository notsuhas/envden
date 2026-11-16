package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	e "github.com/notsuhas/envden/go/core/errors"
)

func TestSafeSyncFiles(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, "nested", "file")
	now := func() int64 { return 1700000000000 }
	if value, err := ReadBytes(path); err != nil || value != nil {
		t.Fatal(value, err)
	}
	for _, value := range [][]byte{{}, []byte("TOKEN=fixture\n"), nil} {
		if err := WriteBytes(path, value, now); err != nil {
			t.Fatal(err)
		}
		got, err := ReadBytes(path)
		if err != nil || !Same(got, value) {
			t.Fatal(got, err)
		}
	}
	for _, target := range []string{home, path} {
		if err := os.Symlink(target, path+".link"); err != nil {
			t.Fatal(err)
		}
		if _, err := ReadBytes(path + ".link"); !e.Is(err, e.InvalidData) {
			t.Fatal(err)
		}
		_ = os.Remove(path + ".link")
	}
	if _, err := ReadBytes(home); !e.Is(err, e.InvalidData) {
		t.Fatal(err)
	}
	if len(filepath.Base(BasePath(home, filepath.Join(home, "store", strings.Repeat("long", 100))))) >= 100 {
		t.Fatal("base filename too long")
	}
	if BasePath(home, path, "a") == BasePath(home, path, "b") {
		t.Fatal("copy bases collide")
	}
	if Same(nil, []byte{}) || !Same([]byte("x"), []byte("x")) {
		t.Fatal("content equality")
	}
	if BasePath(home, path) == BasePath(home, path, "root") || BasePath(home, path) != BasePath(home, path, "") {
		t.Fatal("base identity")
	}
}
