package rejoin

import "context"

type Options struct {
	RecoveryKit string
	Recovery    bool
}
type Actions struct {
	Recovery KitJoin
	Pairing  func(context.Context, bool) error
	Complete func(context.Context) error
}

func RunRejoin(ctx context.Context, o Options, a Actions) error {
	if o.RecoveryKit != "" || o.Recovery {
		if err := KitRejoin(ctx, a.Recovery); err != nil {
			return err
		}
	} else {
		if err := a.Pairing(ctx, true); err != nil {
			return err
		}
	}
	return a.Complete(ctx)
}
