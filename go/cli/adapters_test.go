package cli

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestAdapterWiring(t *testing.T) {
	home := t.TempDir()
	a, e := CreateAdapters(&AdapterOptions{Home: home, UserHome: home, Executable: "/opt/homebrew/Cellar/envden/0.3.8/bin/envden", Hostname: "device"}, func() int64 { return 0 })
	if e != nil {
		t.Fatal(e)
	}

	if a.Network.ID() != "unsupplied" || a.Repo.ID() != "git" || a.Keychain.ID() != "file" || a.Executable != "/opt/homebrew/bin/envden" {
		t.Fatal(a)
	}

	if _, e = a.Network.Status(); !errors.Is(e, errors.Internal) {
		t.Fatal(e)
	}

	slot := "envden/" + a.Home + "/device"
	value, e := a.Keychain.Get(slot, false)
	if e != nil || value != nil {
		t.Fatal(value, e)
	}

	if err := os.MkdirAll(filepath.Join(home, "state"), 0700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(home, "state", "device.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}

	if _, e = a.Keychain.Get(slot, false); !errors.Is(e, errors.Locked) {
		t.Fatal(e)
	}

	if a.ServerPort == nil || a.LocalSetupToken == nil || a.HostServer == nil || a.Timing.Now() != 0 {
		t.Fatal("missing hook")
	}
}

func TestStableExecutable(t *testing.T) {
	for _, row := range []struct{ input, want string }{{"/usr/local/opt/envden/bin/envden", "/usr/local/bin/envden"}, {`C:\Users\name\scoop\apps\envden\0.3.8\envden.exe`, `C:\Users\name\scoop\apps\envden\current\envden.exe`}, {"/other/envden", "/other/envden"}} {
		if got := stableExecutable(row.input); got != row.want {
			t.Fatal(got, row.want)
		}
	}
}

func TestEmptyEnvdenHomeUsesDefaultHome(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("ENVDEN_HOME", "")
	userHome := t.TempDir()
	a, err := CreateAdapters(&AdapterOptions{UserHome: userHome, Executable: "/envden", Hostname: "test"}, func() int64 { return 0 })
	if err != nil {
		t.Fatal(err)
	}
	real, err := filepath.EvalSymlinks(userHome)
	if err != nil || a.Home != filepath.Join(real, ".envden") {
		t.Fatal(a.Home, real, err)
	}
}
