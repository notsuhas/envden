package cli

import (
	"os"
	"path/filepath"
	"runtime"
	"time"

	keyfile "github.com/notsuhas/envden/go/adapters/keychain/file"
	"github.com/notsuhas/envden/go/adapters/network/tailscale"
	placementfs "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/adapters/repo/git"
	"github.com/notsuhas/envden/go/adapters/shell/rc"
	"github.com/notsuhas/envden/go/adapters/storage/sqlite"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	hostservice "github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/cli/network"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/adapters"
	serveridentity "github.com/notsuhas/envden/go/server/identity"
)

type Adapters = contracts.Adapters

type AdapterOptions struct {
	Home, UserHome, Executable, Hostname string
	Keychain                             adapters.Keychain
	Fetcher                              client.Fetch
	Network                              adapters.Network
	ServerPort                           func() (int, error)
	LocalSetupToken                      func() (string, error)
	HostServer                           func(int) (hostservice.Installed, error)
}

func CreateAdapters(options *AdapterOptions, now func() int64) (Adapters, error) {
	var o AdapterOptions
	if options != nil {
		o = *options
	}

	userHome := o.UserHome
	if userHome == "" {
		var err error
		userHome, err = os.UserHomeDir()
		if err != nil {
			return Adapters{}, err
		}
	}

	home := o.Home
	if home == "" {
		var present bool
		home, present = os.LookupEnv("ENVDEN_HOME")
		if !present {
			home = filepath.Join(userHome, ".envden")
		}
	}

	home, err := files.RealLocation(home)
	if err != nil {
		return Adapters{}, err
	}

	executable := o.Executable
	if executable == "" {
		executable, err = os.Executable()
		if err != nil {
			return Adapters{}, err
		}
	}

	host := o.Hostname
	if host == "" {
		host, err = os.Hostname()
		if err != nil {
			return Adapters{}, err
		}
	}

	fetch := o.Fetcher
	if fetch == nil {
		fetch = client.DefaultFetch
	}

	keychain := o.Keychain
	if keychain == nil {
		keychain = deviceKeychain{keyfile.CreateFileKeychainAdapter(keyfile.Options{Home: home}), home}
	}

	networkAdapter := o.Network
	if networkAdapter == nil {
		if options == nil {
			networkAdapter = tailscale.CreateTailscaleNetworkAdapter()
		} else {
			networkAdapter = network.UnsuppliedNetwork()
		}
	}

	a := Adapters{HelloCache: client.NewHelloCache(), Now: now, Home: home, UserHome: userHome, Executable: stableExecutable(executable), Hostname: host, Fetcher: fetch, Keychain: keychain, Repo: git.CreateGitRepoAdapter(), Network: networkAdapter, ServerPort: o.ServerPort, LocalSetupToken: o.LocalSetupToken, HostServer: o.HostServer}
	a.Timing = lock.Timing{Now: now, Wait: func(ms int64) error {
		timer := time.NewTimer(time.Duration(ms) * time.Millisecond)
		defer timer.Stop()
		<-timer.C

		return nil
	}, Delays: []int64{50, 100, 200, 400, 800, 1000}}
	a.PrunePlacementBackups = func(at int64) error { return placementfs.PruneBackups(filepath.Join(home, "conflicts"), at, 30) }
	a.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
		return preparedPlacement{Placement: placementfs.CreateFsPlacementAdapter(mode, root, filepath.Join(home, "conflicts"), now), repo: a.Repo, root: root}
	}
	a.Shell = func(shell string) adapters.Shell {
		return rc.CreateRCShellAdapter(shell, rc.Options{Home: userHome, EnvdenHome: home, BackupDirectory: filepath.Join(home, "conflicts")})
	}
	if a.ServerPort == nil {
		a.ServerPort = func() (int, error) {
			return hostservice.ChooseServerPort(hostservice.SystemPortProbe(), hostservice.DefaultServerPort)
		}
	}

	if a.LocalSetupToken == nil {
		a.LocalSetupToken = func() (string, error) {
			dir := filepath.Join(home, "server")
			keys, err := serveridentity.LoadServerKeys(dir)
			if err != nil {
				return "", err
			}

			storage, err := sqlite.CreateSqliteStorageAdapter(dir, now())
			if err != nil {
				return "", err
			}

			defer func() { _ = storage.Close() }() // Best-effort cleanup must not replace the operation result.

			return serveridentity.ReissueSetup(storage, keys.PublicKey)
		}
	}

	if a.HostServer == nil {
		a.HostServer = func(port int) (hostservice.Installed, error) {
			result, err := hostservice.InstallHostService(hostservice.Options{Platform: runtime.GOOS, Executable: a.Executable, UserHome: userHome, Home: home, Port: port, UID: os.Getuid(), Write: hostservice.WriteThrough, Run: hostservice.RunServiceCommand, Pause: a.Timing.Wait}, now)

			return result, err
		}
	}

	return a, nil
}

type deviceKeychain struct {
	adapters.Keychain
	home string
}

type preparedPlacement struct {
	adapters.Placement
	repo adapters.Repo
	root string
}
