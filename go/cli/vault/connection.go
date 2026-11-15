package vault

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/version"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Connection struct {
	Identity identity.Identity
	VaultID  []byte
	Client   *client.Client
}

func VaultConnection(ctx context.Context, a contracts.Adapters, s *model.State, unlock func(context.Context, *client.Client, []byte) error) (Connection, error) {
	ident, err := identity.DeviceIdentity(ctx, a.Keychain, a.Home, s.DeviceName, false, a.Timing)
	if err != nil {
		return Connection{}, err
	}
	id, err := b.Unbase32(s.VaultID)
	if err != nil {
		return Connection{}, err
	}
	pin, err := client.Binary(s.Server.Pin)
	if err != nil {
		return Connection{}, err
	}
	var cl *client.Client
	opts := client.Options{HelloCache: a.HelloCache, Address: s.Server.Address, Pin: pin, VaultID: id, Identity: ident, Version: version.Version, Now: a.Now, Fetcher: a.Fetcher}
	if unlock != nil {
		opts.Unlock = func(ctx context.Context) error { return unlock(ctx, cl, id) }
	}
	cl = client.CreateClient(opts)
	return Connection{ident, id, cl}, nil
}
