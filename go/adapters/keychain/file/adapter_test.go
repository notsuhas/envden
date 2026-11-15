package file

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestKeys(t *testing.T) {
	home := t.TempDir()
	a := CreateFileKeychainAdapter(Options{Home: home})
	for _, name := range []string{"../name", strings.Repeat("k", 200)} {
		if e := a.Set(name, []byte{0, 255, 128}); e != nil {
			t.Fatal(e)
		}
		b, e := CreateFileKeychainAdapter(Options{Home: home}).Get(name, false)
		if e != nil || !bytes.Equal(b, []byte{0, 255, 128}) {
			t.Fatal(b, e)
		}
	}
	dir := filepath.Join(home, "state", "keys")
	s, e := os.Stat(dir)
	if e != nil || s.Mode().Perm() != 0700 {
		t.Fatal(s, e)
	}
	entries, e := os.ReadDir(dir)
	if e != nil {
		t.Fatal(e)
	}
	for _, entry := range entries {
		s, e = os.Stat(filepath.Join(dir, entry.Name()))
		if e != nil || s.Mode().Perm() != 0600 {
			t.Fatal(s, e)
		}
	}
	path := filepath.Join(dir, fmt.Sprintf("%x.key", sha256.Sum256([]byte("../name"))))
	if e = os.Chmod(path, 0644); e != nil { //nolint:gosec // G302: fixture creates an unsafe key file to test access restriction.
		t.Fatal(e)
	}
	only, e := a.OwnerOnly()
	if e != nil || only {
		t.Fatal(only, e)
	}
	if _, e = a.Get("../name", false); !errors.Is(e, errors.InvalidData) {
		t.Fatal(e)
	}
}

func TestRequiredAndFailure(t *testing.T) {
	home := t.TempDir()
	a := CreateFileKeychainAdapter(Options{Home: home})
	if _, e := a.Get("device", true); !errors.Is(e, errors.Locked) || !strings.Contains(e.Error(), "run envden join") {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(home, "state"), []byte("private contents"), 0600); e != nil {
		t.Fatal(e)
	}
	e := a.Set("key", []byte{1})
	if !errors.Is(e, errors.Locked) || e.Error() != "Key storage operation failed" {
		t.Fatal(e)
	}
}

func TestDirectoryReadable(t *testing.T) {
	home := t.TempDir()
	a := CreateFileKeychainAdapter(Options{Home: home})
	if e := a.Set("key", []byte{1}); e != nil {
		t.Fatal(e)
	}
	dir := filepath.Join(home, "state", "keys")
	if e := os.Chmod(dir, 0755); e != nil { //nolint:gosec // G302: fixture tests restriction of an existing public keychain directory.
		t.Fatal(e)
	}
	ok, e := a.OwnerOnly()
	if e != nil || ok {
		t.Fatal(ok, e)
	}
}
