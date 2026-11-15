package session

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/version"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func UnlockDevice(ctx context.Context, a contracts.Adapters, password Password, fetch client.Fetch) error {
	s, err := store.LoadState(a.Home)
	if err != nil {
		return err
	}
	s, err = state.RequireConfigured(s)
	if err != nil {
		return err
	}
	ident, err := identity.DeviceIdentity(ctx, a.Keychain, a.Home, s.DeviceName, false, a.Timing)
	if err != nil {
		return err
	}
	pin, err := client.Binary(s.Server.Pin)
	if err != nil {
		return err
	}
	vault, err := b.Unbase32(s.VaultID)
	if err != nil {
		return err
	}
	c := client.CreateClient(client.Options{HelloCache: a.HelloCache, Address: s.Server.Address, Pin: pin, VaultID: vault, Identity: ident, Version: version.Version, Now: a.Now, Fetcher: fetch})
	window, err := Login(ctx, c, vault, password, "")
	if err != nil || window == nil {
		return err
	}
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		current, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}
		current, err = state.RequireConfigured(current)
		if err != nil {
			return err
		}
		current.Session = window
		current.Touch("session")
		return store.SaveState(ctx, a.Home, current, a.Timing)
	})
}
