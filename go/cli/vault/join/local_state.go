package join

import (
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/errors"
)

func LocalState(home, vaultID string) (*model.State, error) {
	state, err := store.LoadState(home)
	if err != nil || state == nil || state.VaultID == "" {
		return nil, err
	}
	if state.VaultID == vaultID {
		return state, nil
	}
	if state.CreationPending == "" {
		return nil, errors.New(errors.Conflict, "Device is already configured for another vault")
	}
	return nil, nil
}
