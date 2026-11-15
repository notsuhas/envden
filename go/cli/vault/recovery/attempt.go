package recovery

import (
	"context"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
)

type JoinOptions struct {
	Rejoin                                      bool
	Address, VaultID, SecretKey, Password, Name string
	Now                                         func() int64
}

func KitJoin(ctx context.Context, a contracts.Adapters, o JoinOptions) (*model.State, error) {
	var result *model.State
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		var err error
		result, err = client.RetryHead(func() (*model.State, error) { return attemptKitJoin(ctx, a, o) })

		return err
	})

	return result, err
}
