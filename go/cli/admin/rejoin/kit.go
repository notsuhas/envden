package rejoin

import "context"

type KitJoin func(context.Context, bool) error

func KitRejoin(ctx context.Context, join KitJoin) error { return join(ctx, true) }
