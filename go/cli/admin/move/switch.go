package move

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

// Unlock logs in to the destination; nil means no terminal, so a locked destination fails.
type Unlock func(ctx context.Context, cl *client.Client, vaultID []byte) (*model.Window, error)

// The destination keeps its own unlock sessions, so a locked device logs in there, never at the old address.
func SwitchServer(ctx context.Context, a contracts.Adapters, address string, now func() int64, fetch client.Fetch, unlock Unlock) error {
	attempt := func(window *model.Window) error {
		return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
			return switchLocked(ctx, a, address, now, fetch, window)
		})
	}

	err := attempt(nil)
	if unlock == nil || !errors.Is(err, errors.Locked) {
		return err
	}

	// The password prompt runs outside the state lock so a retry never blocks other commands.
	cxt, cl, _, err := destination(ctx, a, address, now, fetch)
	if err != nil {
		return err
	}

	window, err := unlock(ctx, cl, cxt.VaultID)
	if err != nil {
		return err
	}

	return attempt(window)
}

func destination(ctx context.Context, a contracts.Adapters, address string, now func() int64, fetch client.Fetch) (*shared.Context, *client.Client, []byte, error) {
	cxt, err := shared.AdminContext(ctx, a, now, fetch)
	if err != nil {
		return nil, nil, nil, err
	}

	server, err := client.Hello(ctx, address, nil, fetch, version.MinServer)
	if err != nil {
		return nil, nil, nil, err
	}

	cl := client.CreateClient(client.Options{Address: address, Pin: server.Pin, VaultID: cxt.VaultID, Identity: cxt.Identity, Now: now, Fetcher: fetch, Version: version.Version, HelloCache: a.HelloCache})

	return cxt, cl, server.Pin, nil
}

func switchLocked(ctx context.Context, a contracts.Adapters, address string, now func() int64, fetch client.Fetch, window *model.Window) error {
	cxt, cl, pin, err := destination(ctx, a, address, now, fetch)
	if err != nil {
		return err
	}

	h, err := shared.ReadHistory(ctx, cl, cxt.VaultID)
	if err != nil {
		return err
	}

	if err = shared.CheckFloor(cxt.Local, h); err != nil {
		return err
	}

	moved := lastMove(h)
	if moved == nil || !encoding.Equal(moved.NewPin, pin) || !encoding.Equal(h.State.ServerPin, pin) {
		return errors.New(errors.InvalidData, "Server has no verified move to this pin")
	}

	cxt.Local.Server = &model.Server{Address: address, Pin: client.Text(pin), Protocol: 1}
	if window != nil {
		cxt.Local.Session = window
		cxt.Local.Touch("session")
	}

	return store.SaveState(ctx, a.Home, cxt.Local, a.Timing)
}

func lastMove(h shared.History) *entrypayloads.ServerMoved {
	for i := len(h.Entries) - 1; i >= 0; i-- {
		if pld, ok := h.Entries[i].Body.Payload.(entrypayloads.ServerMoved); ok {
			return &pld
		}
	}

	return nil
}
