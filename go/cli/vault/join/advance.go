package join

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/model"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
)

func advanceCheckpoint(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, state *model.State, history vault.History) (*model.State, error) {
	stored, err := material.CheckpointMaterial(a, state)
	if err != nil {
		return nil, err
	}
	c := &sm.Context{Context: ctx, Adapters: a, Client: cl, Identity: ident, State: state, SkippedRoots: map[string]bool{}, Headers: stored.Headers, Entries: stored.Entries, Keys: stored.Keys, Checkpoint: stored.Checkpoint, VaultID: stored.Checkpoint.Header.Body.VaultId, Options: sm.Options{Now: func() int64 { return 0 }, Fetcher: a.Fetcher}}
	if _, err = remote.AcceptHead(c, &history, false); err != nil {
		return nil, err
	}
	return state, remote.PersistCheckpoint(c)
}
