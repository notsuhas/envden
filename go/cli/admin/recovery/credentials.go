package recovery

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type ReplacementKit struct {
	VaultID   string `json:"vaultId"`
	SecretKey string `json:"secretKey"`
	Server    string `json:"server"`
}

type ReplaceResult struct {
	Kind string
	Kit  *ReplacementKit
}

func ReplaceKit(ctx context.Context, a contracts.Adapters, password string, now func() int64, onKit func(ReplacementKit) error, fetch client.Fetch, removed []byte) (ReplaceResult, error) {
	var result ReplaceResult
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		k, err := keys.GenerateRecoveryKeys()
		if err != nil {
			return err
		}

		secret := crypto.RandomBytes(16)
		shown := false
		defer func() { clear(k.EncSk); clear(k.ObjSk); clear(secret) }()
		result, err = client.RetryHead(func() (ReplaceResult, error) {
			cxt, e := shared.AdminContext(ctx, a, now, fetch)
			if e != nil {
				return ReplaceResult{}, e
			}

			settled, e := SettlePendingKit(ctx, cxt)
			if e != nil {
				return ReplaceResult{}, e
			}

			if settled {
				return ReplaceResult{Kind: "finished"}, nil
			}

			if _, e = session.Login(ctx, cxt.Client, cxt.VaultID, session.Password{Value: password}, ""); e != nil {
				return ReplaceResult{}, e
			}

			h, e := shared.CurrentHistory(ctx, cxt)
			if e != nil {
				return ReplaceResult{}, e
			}

			id, e := keys.RecoveryID(k.EncPub, k.ObjPub)
			if e != nil {
				return ReplaceResult{}, e
			}

			record := members.RecoveryRecord{Id: id, EncPub: k.EncPub, ObjPub: k.ObjPub}
			change, ring, e := shared.NextEpoch(ctx, cxt, h, record, removed)
			if e != nil {
				return ReplaceResult{}, e
			}

			kind, op := 4, 7
			var payload any = entrypayloads.ReplaceRecovery{Recovery: record, Change: change}
			if removed != nil {
				kind = 2
				op = 5
				payload = entrypayloads.RemoveDevice{Device: removed, NewRecovery: &record, Change: change}
			}

			entry, e := shared.SignEntry(cxt, h, kind, payload)
			if e != nil {
				return ReplaceResult{}, e
			}

			box, e := SealRecoveryEnvelope(cxt, h, k, password, secret, now)
			if e != nil {
				return ReplaceResult{}, e
			}

			pub, e := keys.SKPub(secret, cxt.VaultID)
			if e != nil {
				return ReplaceResult{}, e
			}

			swap, e := shared.AdminSwap(h, cxt.Identity, op, now(), manifests.Swap{Entries: []encoding.Signed[codecs.Entry]{entry}, Keyring: &ring, Envelope: &box, SkPub: &pub})
			if e != nil {
				return ReplaceResult{}, e
			}

			text, e := keys.EncodeSecretKey(secret)
			if e != nil {
				return ReplaceResult{}, e
			}

			kit := ReplacementKit{encoding.Base32(cxt.VaultID), text, cxt.Local.Server.Address}
			if e = SavePendingKit(cxt, swap); e != nil {
				return ReplaceResult{}, e
			}

			if !shown {
				if e = onKit(kit); e != nil {
					return ReplaceResult{}, e
				}

				shown = true
			}

			if e = shared.CommitAdmin(ctx, cxt, swap); e != nil {
				return ReplaceResult{}, e
			}

			if e = ClearPendingKit(cxt); e != nil {
				return ReplaceResult{}, e
			}

			return ReplaceResult{Kind: "replaced", Kit: &kit}, nil
		})

		return err
	})

	return result, err
}
