package pairing

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/errors"
)

func RefuseCommittedJoin(a contracts.Adapters, rejoin bool) error {
	state, err := store.LoadState(a.Home)
	if err != nil {
		return err
	}
	if rejoin || state == nil || state.VaultID == "" || state.CreationPending != "" {
		return nil
	}
	if err = persistence.ClearJoiner(a); err != nil {
		return err
	}
	return errors.New(errors.Conflict, "Device already belongs to a vault; back up env files and remove the local envden home before joining another vault")
}
