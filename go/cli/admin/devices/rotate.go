package devices

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RotateVault(ctx context.Context, a contracts.Adapters, password string, now func() int64, fetch client.Fetch) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		_, err := client.RetryHead(func() (bool, error) {
			cxt, e := shared.AdminContext(ctx, a, now, fetch)
			if e != nil {
				return false, e
			}
			if _, e = session.Login(ctx, cxt.Client, cxt.VaultID, session.Password{Value: password}, ""); e != nil {
				return false, e
			}
			h, e := shared.CurrentHistory(ctx, cxt)
			if e != nil {
				return false, e
			}
			change, ring, e := shared.NextEpoch(ctx, cxt, h, h.State.Recovery, nil)
			if e != nil {
				return false, e
			}
			entry, e := shared.SignEntry(cxt, h, 3, p.NewEpoch{Change: change})
			if e != nil {
				return false, e
			}
			swap, e := shared.AdminSwap(h, cxt.Identity, 6, now(), m.Swap{Entries: []b.Signed[c.Entry]{entry}, Keyring: &ring})
			if e != nil {
				return false, e
			}
			e = shared.CommitAdmin(ctx, cxt, swap)
			return e == nil, e
		})
		return err
	})
}
