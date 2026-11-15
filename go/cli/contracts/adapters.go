package contracts

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/adapters"
)

type Adapters struct {
	HelloCache                           *client.HelloCache
	Now                                  func() int64
	Timing                               lock.Timing
	PrunePlacementBackups                func(int64) error
	Home, UserHome, Executable, Hostname string
	Fetcher                              client.Fetch
	Keychain                             adapters.Keychain
	Repo                                 adapters.Repo
	Placement                            func(adapters.PlacementMode, string) adapters.Placement
	Shell                                func(string) adapters.Shell
	Network                              adapters.Network
	ServerPort                           func() (int, error)
	LocalSetupToken                      func() (string, error)
	HostServer                           func(int) (host.Installed, error)
}
