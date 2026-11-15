package pairing

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/server/shared"
)

func binding(n int) []byte { return []byte{byte((n >> 8) & 255), byte(n & 255)} }

func MailboxSide(owner, write bool, slot adapters.MailboxSlot) bool {
	responder := slot == adapters.SlotKE2
	if write {
		return owner == responder
	}

	return responder || owner
}

type access struct {
	box            *adapters.StoredMailbox
	key, bound, id []byte
}

func Accessible(o shared.Options, auth *shared.Auth, n int, slot adapters.MailboxSlot, write bool) (access, error) {
	id, err := MailboxVault(o, auth.Request.VaultId, n)
	if err != nil {
		return *new(access), err
	}

	box, err := o.Storage.Mailbox(id, n, o.Now())
	if err != nil {
		return *new(access), err
	}
	if box == nil {
		return *new(access), enverrors.New(enverrors.NotFound, "Mailbox closed")
	}
	owner := bytes.Equal(box.Device, auth.Request.Device)
	if !MailboxSide(owner, write, slot) {
		return *new(access), enverrors.New(enverrors.Unauthorized, "Wrong mailbox side")
	}
	key := binding(n)
	bound, err := o.Storage.State(id, adapters.StateMailboxJoiner, key)
	if err != nil {
		return *new(access), err
	}
	if !owner && bound != nil && !bytes.Equal(bound, auth.Request.Device) {
		return *new(access), enverrors.New(enverrors.Unauthorized, "Wrong joiner")
	}
	if !owner && bound == nil && (!write || slot != adapters.SlotKE1) {
		return *new(access), enverrors.New(enverrors.Unauthorized, "Joiner not bound")
	}

	return access{box, key, bound, id}, nil
}
