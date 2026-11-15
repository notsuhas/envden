package sqlite

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPersistsWALOnlyOnDarwin(t *testing.T) {
	cases := map[string]bool{"darwin": true, "linux": false, "windows": false}

	for goos, want := range cases {
		if got := persistsWAL(goos); got != want {
			t.Errorf("%s: got %v, want %v", goos, got, want)
		}
	}
}

func TestCloseKeepsWALFilesLikeBun(t *testing.T) {
	dir := t.TempDir()

	storage, err := CreateSqliteStorageAdapter(dir, 0)
	if err != nil {
		t.Fatal(err)
	}

	if err := storage.Close(); err != nil {
		t.Fatal(err)
	}

	info, statErr := os.Stat(filepath.Join(dir, "envden.sqlite-wal"))
	if kept := statErr == nil; kept != persistsWAL(runtime.GOOS) {
		t.Fatalf("wal kept = %v on %s", kept, runtime.GOOS)
	}

	if statErr == nil && info.Size() != 0 {
		t.Fatalf("kept wal holds %d bytes, want an empty file", info.Size())
	}
}
