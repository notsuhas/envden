package unlock

import (
	"context"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
)

func ProbeUnlock(ctx context.Context, a contracts.Adapters) Probe {
	state, err := store.LoadState(a.Home)
	if err == nil && state != nil && state.Server != nil && state.VaultID != "" {
		connection, e := vault.VaultConnection(ctx, a, state, nil)
		err = e
		if err == nil {
			period, e := settings.GetUnlockPeriod(ctx, connection.Client)
			err = e
			if err == nil {
				return Probe{Kind: "unlocked", Period: period.Period}
			}
		}
	}

	if errors.Is(err, errors.Locked) {
		return Probe{Kind: "locked"}
	}

	return Probe{Kind: "unreachable"}
}
