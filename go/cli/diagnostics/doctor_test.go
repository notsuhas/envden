package diagnostics

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/core/adapters"
	key "github.com/notsuhas/envden/go/testing/keychain"
	"github.com/notsuhas/envden/go/testing/network"
	"github.com/notsuhas/envden/go/testing/shell"
)

func TestDoctorWithFakes(t *testing.T) {
	home := t.TempDir()
	home, _ = filepath.EvalSymlinks(home)
	a := contracts.Adapters{Home: filepath.Join(home, ".envden"), UserHome: home, Keychain: key.CreateFakeKeychainAdapter(key.Operations{OwnerOnly: func() (bool, error) { return true, nil }}), Network: network.CreateFakeNetworkAdapter(network.Operations{Status: func() (adapters.NetworkStatus, error) {
		return adapters.NetworkStatus{Ready: true, Running: true, LoggedIn: true, HTTPSEnabled: true, Hostname: "test", HasHostname: true}, nil
	}, CheckHTTPSCertificate: func() (adapters.HTTPSCheck, error) { return adapters.HTTPSCheck{Ready: true}, nil }}), Shell: func(name string) adapters.Shell {
		return shell.CreateFakeShellAdapter(shell.Operations{RCPath: func() string { return "/fake/" + name }, Installed: func() (bool, error) { return name == "zsh", nil }})
	}}
	r, e := Doctor(a, settings.Paths(a.Home))
	if e != nil || !r.Symlinks || !r.Keys.OwnerOnly || r.Keys.Location != "~/.envden" || len(r.Shells) != 4 || !r.Shells[0].Installed {
		t.Fatal(r, e)
	}

	entries, e := os.ReadDir(filepath.Join(a.Home, "state"))
	if e != nil || len(entries) != 0 {
		t.Fatal(entries, e)
	}
}
