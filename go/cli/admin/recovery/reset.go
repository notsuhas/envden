package recovery

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
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

func ResetPassword(ctx context.Context, a contracts.Adapters, password, kit string, now func() int64, fetch client.Fetch) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		_, err := client.RetryHead(func() (bool, error) {
			secret, e := keys.DecodeSecretKey(kit)
			if e != nil {
				return false, e
			}
			defer clear(secret)
			k, e := keys.GenerateRecoveryKeys()
			if e != nil {
				return false, e
			}
			defer clear(k.EncSk)
			defer clear(k.ObjSk)
			cxt, e := shared.AdminContext(ctx, a, now, fetch, func(r s.Request) ([]byte, error) { return proofs.SignSKProof(secret, r.VaultId, r) })
			if e != nil {
				return false, e
			}
			h, e := shared.CurrentHistory(ctx, cxt)
			if e != nil {
				return false, e
			}
			id, e := keys.RecoveryID(k.EncPub, k.ObjPub)
			if e != nil {
				return false, e
			}
			recovery := members.RecoveryRecord{Id: id, EncPub: k.EncPub, ObjPub: k.ObjPub}
			change, ring, e := shared.NextEpoch(ctx, cxt, h, recovery, nil)
			if e != nil {
				return false, e
			}
			entry, e := shared.SignEntry(cxt, h, 4, p.ReplaceRecovery{Recovery: recovery, Change: change})
			if e != nil {
				return false, e
			}
			record, e := session.RegisterPassword(ctx, cxt.Client, cxt.VaultID, password)
			if e != nil {
				return false, e
			}
			box, e := SealRecoveryEnvelope(cxt, h, k, password, secret, now)
			if e != nil {
				return false, e
			}
			raw, e := client.Binary(record)
			if e != nil {
				return false, e
			}
			swap, e := shared.AdminSwap(h, cxt.Identity, 9, now(), m.Swap{Entries: []b.Signed[c.Entry]{entry}, Keyring: &ring, Envelope: &box, OpaqueRecord: &raw})
			if e != nil {
				return false, e
			}
			e = shared.CommitAdmin(ctx, cxt, swap)
			return e == nil, e
		})
		return err
	})
}
