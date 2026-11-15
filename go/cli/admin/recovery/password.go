package recovery

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func ChangePassword(ctx context.Context, a contracts.Adapters, oldPassword, newPassword, kit string, now func() int64, fetch client.Fetch) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		_, err := client.RetryHead(func() (bool, error) {
			c, e := shared.AdminContext(ctx, a, now, fetch)
			if e != nil {
				return false, e
			}

			if _, e = session.Login(ctx, c.Client, c.VaultID, session.Password{Value: oldPassword}, ""); e != nil {
				return false, e
			}

			h, e := shared.CurrentHistory(ctx, c)
			if e != nil {
				return false, e
			}

			box, e := shared.OptionalObject(ctx, c.Client, "/v1/envelope")
			if e != nil {
				return false, e
			}

			if !encoding.Equal(crypto.H("envelope-blob", box), h.Headers[len(h.Headers)-1].Body.EnvelopeHash) {
				return false, errors.New(errors.InvalidData, "Envelope hash mismatch")
			}

			secret, e := keys.DecodeSecretKey(kit)
			if e != nil {
				return false, e
			}

			defer clear(secret)
			opened, e := envelope.OpenEnvelope(box, oldPassword, secret, c.VaultID)
			if e != nil {
				return false, e
			}

			defer clear(opened.RecoveryEncSk)
			defer clear(opened.RecoveryObjSk)
			record, e := session.RegisterPassword(ctx, c.Client, c.VaultID, newPassword)
			if e != nil {
				return false, e
			}

			opened.Checkpoint = shared.HeaderHash(h.Headers[len(h.Headers)-1])
			opened.SealedAt = uint64(now()) //nolint:gosec // Unix millisecond clock values are nonnegative.
			sealed, e := envelope.SealEnvelope(opened, newPassword, secret)
			if e != nil {
				return false, e
			}

			raw, e := client.Binary(record)
			if e != nil {
				return false, e
			}

			swap, e := shared.AdminSwap(h, c.Identity, 8, now(), manifests.Swap{Envelope: &sealed, OpaqueRecord: &raw})
			if e != nil {
				return false, e
			}

			e = shared.CommitAdmin(ctx, c, swap)

			return e == nil, e
		})

		return err
	})
}
