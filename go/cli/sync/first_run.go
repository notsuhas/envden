package sync

import (
	"context"

	"github.com/notsuhas/envden/go/cli/contracts"
)

func FirstRun(ctx context.Context, a contracts.Adapters, options Options, choose func(string) (string, error)) (Result, error) {
	return runSync(ctx, a, options, false, choose)
}
