package shared

import (
	"context"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Context struct {
	Adapters contracts.Adapters
	Local    *model.State
	Identity identity.Identity
	VaultID  []byte
	Client   *client.Client
	Now      func() int64
}

func AdminContext(ctx context.Context, a contracts.Adapters, now func() int64, fetch client.Fetch, proof ...func(serverprotocol.Request) ([]byte, error)) (*Context, error) {
	local, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}

	if local == nil || local.Server == nil || local.VaultID == "" {
		return nil, errors.New(errors.NotFound, state.NotSetUp)
	}

	id, err := identity.DeviceIdentity(ctx, a.Keychain, a.Home, local.DeviceName, false, a.Timing)
	if err != nil {
		return nil, err
	}

	vault, err := encoding.Unbase32(local.VaultID)
	if err != nil {
		return nil, err
	}

	pin, err := client.Binary(local.Server.Pin)
	if err != nil {
		return nil, err
	}

	if fetch == nil {
		fetch = a.Fetcher
	}

	options := client.Options{Address: local.Server.Address, Pin: pin, VaultID: vault, Identity: id, Now: now, Fetcher: fetch, Version: version.Version, HelloCache: a.HelloCache}
	if len(proof) > 0 {
		options.Proof = proof[0]
	}

	return &Context{a, local, id, vault, client.CreateClient(options), now}, nil
}
