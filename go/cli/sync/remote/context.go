package remote

import (
	"context"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/store"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
	e "github.com/notsuhas/envden/go/core/errors"
)

func SyncContext(ctx context.Context, a contracts.Adapters, options sm.Options, links sm.Links) (*sm.Context, error) {
	state, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}
	if state == nil || state.Server == nil || state.VaultID == "" || state.Checkpoint == "" || state.Files == "" || state.Keyring == "" {
		return nil, e.New(e.NotFound, "Not set up yet. Run envden setup or envden join")
	}

	connectionAdapters := a
	connectionAdapters.Now = options.Now
	if options.Fetcher != nil {
		connectionAdapters.Fetcher = options.Fetcher
	}
	unlock := options.Unlock
	if options.Interactive == nil || !*options.Interactive {
		unlock = nil
	}
	connection, err := vault.VaultConnection(ctx, connectionAdapters, state, unlock)
	if err != nil {
		return nil, err
	}
	checkpoint, err := material.CheckpointMaterial(a, state)
	if err != nil {
		return nil, err
	}

	return &sm.Context{
		Context: ctx, Adapters: a, Options: options, State: state, SkippedRoots: map[string]bool{},
		Identity: connection.Identity, VaultID: connection.VaultID, Client: connection.Client,
		Checkpoint: checkpoint.Checkpoint, Headers: checkpoint.Headers, Entries: checkpoint.Entries, Keys: checkpoint.Keys, Links: links,
	}, nil
}
