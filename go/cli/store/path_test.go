package store

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestStorePath(t *testing.T) {
	home := t.TempDir()
	a, e := StorePath(home, "repo-a", "config/.env")
	if e != nil || !strings.HasPrefix(a, filepath.Join(home, "store")+string(filepath.Separator)) {
		t.Fatal(a, e)
	}
	b, e := StorePath(home, "repo-b", "config/.env")
	if e != nil || a == b {
		t.Fatal(a, b, e)
	}
	for _, unsafe := range []string{"../.env", "/absolute", "a/../b", "CON", "a\\b", ""} {
		if _, e := StorePath(home, "repo-a", unsafe); e == nil {
			t.Fatal(unsafe)
		}
	}
}
