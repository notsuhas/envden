package shell

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func ShellContract(t *testing.T, factory func(string) adapters.Shell) {
	t.Helper()
	t.Run("idempotent install and uninstall preserve configuration", func(t *testing.T) {
		home := t.TempDir()
		a := factory(home)
		rel, e := filepath.Rel(home, a.RCPath())
		if e != nil || strings.HasPrefix(rel, "..") {
			t.Fatal(rel, e)
		}
		installed, e := a.Installed()
		if e != nil || installed {
			t.Fatal(installed, e)
		}
		if e = os.MkdirAll(filepath.Dir(a.RCPath()), 0700); e != nil {
			t.Fatal(e)
		}
		original := "# user configuration\n"
		if e = os.WriteFile(a.RCPath(), []byte(original), 0600); e != nil {
			t.Fatal(e)
		}
		binary := filepath.Join(home, "bin", "envden")
		if e = a.Install(binary); e != nil {
			t.Fatal(e)
		}
		b, e := os.ReadFile(a.RCPath())
		if e != nil || !strings.Contains(string(b), a.HookSnippet(binary)) {
			t.Fatal("snippet missing", e)
		}
		installed, e = a.Installed()
		if e != nil || !installed {
			t.Fatal(installed, e)
		}
		if e = a.Install(binary); e != nil {
			t.Fatal(e)
		}
		again, _ := os.ReadFile(a.RCPath())
		if string(b) != string(again) {
			t.Fatal("install changed bytes")
		}
		for range 2 {
			if e = a.Uninstall(); e != nil {
				t.Fatal(e)
			}
		}
		b, e = os.ReadFile(a.RCPath())
		if e != nil || string(b) != original {
			t.Fatal("original changed", e)
		}
		installed, e = a.Installed()
		if e != nil || installed {
			t.Fatal(installed, e)
		}
	})
	t.Run("missing parent directories", func(t *testing.T) {
		home := t.TempDir()
		a := factory(home)
		if e := a.Uninstall(); e != nil {
			t.Fatal(e)
		}
		if e := a.Install(filepath.Join(home, "envden")); e != nil {
			t.Fatal(e)
		}
		ok, e := a.Installed()
		if e != nil || !ok {
			t.Fatal(ok, e)
		}
		if e = a.Uninstall(); e != nil {
			t.Fatal(e)
		}
	})
}
