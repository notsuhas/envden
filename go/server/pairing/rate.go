package pairing

import (
	"fmt"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/server/shared"
)

func Charge(o shared.Options, auth *shared.Auth, n int, authorize func() error) error {
	if auth.Member {
		return authorize()
	}
	id, err := MailboxVault(o, auth.Request.VaultId, n)
	if err != nil {
		return err
	}
	box, err := o.Storage.Mailbox(id, n, o.Now())
	if err != nil {
		return err
	}
	if box == nil {
		return enverrors.New(enverrors.NotFound, "Mailbox closed")
	}
	mailbox := crypto.SHA256(append([]byte(fmt.Sprintf("mailbox/%d/%d/", n, box.ExpiresAt)), id...))
	if err := authorize(); err != nil {
		rejected := crypto.SHA256(append([]byte("rejected/"), mailbox...))
		if chargeErr := charge(o, rejected); chargeErr != nil {
			return chargeErr
		}

		return err
	}

	return charge(o, mailbox)
}

func charge(o shared.Options, id []byte) error {
	result, err := o.Storage.Charge(id, adapters.RateBucket{Kind: "mailbox"}, o.Now())
	if err != nil {
		return err
	}
	if result.Kind == "locked" {
		return enverrors.New(enverrors.RateLimited, "Too many mailbox writes")
	}

	return nil
}
