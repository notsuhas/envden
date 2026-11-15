package pairing

import (
	"bytes"
	"strconv"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

var namespace = make([]byte, 32)

func lookup(o shared.Options, id []byte, kind, key string) ([]byte, error) {
	if !bytes.Equal(id, namespace) {
		return id, nil
	}
	found, err := o.Storage.State(namespace, adapters.StatePairingIndex, []byte(kind+"/"+key))
	if err != nil {
		return nil, err
	}
	if found == nil {
		return namespace, nil
	}

	return found, nil
}

func MailboxVault(o shared.Options, id []byte, number int) ([]byte, error) {
	return lookup(o, id, "mailbox", strconv.Itoa(number))
}

func index(o shared.Options, kind, key string, id []byte) error {
	return o.Storage.WriteState(namespace, []adapters.StateWrite{{Kind: adapters.StatePairingIndex, Key: []byte(kind + "/" + key), Bytes: id}})
}

func Open(o shared.Options, auth *shared.Auth) (wire.MailboxOpened, error) {
	return shared.Transaction(o.Storage, func() (wire.MailboxOpened, error) {
		fresh := *auth
		r := auth.Request
		membership, err := vaultchain.Membership(o, r.VaultId, r.Device)
		if err != nil {
			return wire.MailboxOpened{}, err
		}

		fresh.Member = membership != nil
		if err := authn.RequireGate(o, &fresh, "fresh"); err != nil {
			return wire.MailboxOpened{}, err
		}
		box, err := o.Storage.OpenMailbox(r.VaultId, r.Device, o.Now())
		if err != nil {
			return wire.MailboxOpened{}, err
		}
		if box == nil {
			return wire.MailboxOpened{}, enverrors.New(enverrors.RateLimited, "Mailbox limit reached")
		}
		if err := o.Storage.WriteState(r.VaultId, []adapters.StateWrite{{Kind: adapters.StateMailboxJoiner, Key: binding(box.Number)}}); err != nil {
			return wire.MailboxOpened{}, err
		}
		if err := index(o, "mailbox", strconv.Itoa(box.Number), r.VaultId); err != nil {
			return wire.MailboxOpened{}, err
		}

		return wire.MailboxOpened{Number: box.Number, ExpiresAt: box.ExpiresAt}, nil
	})
}

func Write(o shared.Options, auth *shared.Auth, n int, slot adapters.MailboxSlot, message string) (wire.MailboxWriteResponse, error) {
	access, err := Accessible(o, auth, n, slot, true)
	if err != nil {
		return wire.MailboxWriteResponse{}, err
	}

	data, err := shared.Binary(message)
	if err != nil {
		return wire.MailboxWriteResponse{}, err
	}

	prior := access.box.Slots[slot]
	if prior != nil && !bytes.Equal(prior, data) {
		if err := o.Storage.CloseMailbox(access.id, n); err != nil {
			return wire.MailboxWriteResponse{}, err
		}

		return wire.MailboxWriteResponse{}, enverrors.New(enverrors.Conflict, "Mailbox closed")
	}
	if len(data) > 4096 {
		return wire.MailboxWriteResponse{}, enverrors.New(enverrors.InvalidInput, "Message too large")
	}
	lengths := map[adapters.MailboxSlot]int{adapters.SlotKE1: 96, adapters.SlotKE2: 320, adapters.SlotKE3: 64}
	length, ok := lengths[slot]
	if ok {
		_, err := shared.Input(func() (string, error) {
			return opaque.OpaqueMessage(message, length)
		})
		if err != nil {
			return wire.MailboxWriteResponse{}, err
		}
	}
	result, err := o.Storage.WriteMailbox(access.id, n, slot, data, o.Now())
	if err != nil {
		return wire.MailboxWriteResponse{}, err
	}
	if result == "closed" {
		return wire.MailboxWriteResponse{}, enverrors.New(enverrors.Conflict, "Mailbox closed")
	}
	if result == "out-of-order" {
		return wire.MailboxWriteResponse{}, enverrors.New(enverrors.Conflict, "Mailbox slot out of order")
	}
	if slot == adapters.SlotKE1 && (access.bound == nil || access.box.Slots[adapters.SlotKE1] == nil) {
		if err := o.Storage.WriteState(access.id, []adapters.StateWrite{{Kind: adapters.StateMailboxJoiner, Key: access.key, Bytes: auth.Request.Device}}); err != nil {
			return wire.MailboxWriteResponse{}, err
		}
	}
	if slot == adapters.SlotPairJoiner {
		if err := index(o, "approver", shared.Text(auth.Request.Device), access.id); err != nil {
			return wire.MailboxWriteResponse{}, err
		}
	}

	return wire.MailboxWriteResponse{Kind: string(result), ExpiresAt: access.box.ExpiresAt}, nil
}

func Read(o shared.Options, auth *shared.Auth, n int, slot adapters.MailboxSlot) (wire.MailboxSlotResponse, error) {
	access, err := Accessible(o, auth, n, slot, false)
	if err != nil {
		return wire.MailboxSlotResponse{}, err
	}

	result := wire.MailboxSlotResponse{ExpiresAt: access.box.ExpiresAt}
	data := access.box.Slots[slot]
	if data != nil {
		text := shared.Text(data)
		result.Message = &text
	} else {
		result.Kind = "pending"
	}

	return result, nil
}

func Close(o shared.Options, auth *shared.Auth, n int) (wire.KindResponse, error) {
	r := auth.Request
	box, err := o.Storage.Mailbox(r.VaultId, n, o.Now())
	if err != nil {
		return wire.KindResponse{}, err
	}
	if box == nil || !bytes.Equal(box.Device, r.Device) {
		return wire.KindResponse{}, enverrors.New(enverrors.Unauthorized, "Wrong mailbox owner")
	}
	if err := o.Storage.CloseMailbox(r.VaultId, n); err != nil {
		return wire.KindResponse{}, err
	}

	return wire.KindResponse{Kind: "closed"}, nil
}

func Approver(o shared.Options, auth *shared.Auth) (wire.MailboxWrite, error) {
	r := auth.Request
	id, err := lookup(o, r.VaultId, "approver", shared.Text(r.Device))
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	data, err := o.Storage.Approver(id, r.Device, o.Now())
	if err != nil {
		return wire.MailboxWrite{}, err
	}
	if data == nil {
		return wire.MailboxWrite{}, enverrors.New(enverrors.NotFound, "Approver unavailable")
	}

	return wire.MailboxWrite{Message: shared.Text(data)}, nil
}

func RequireGrant(o shared.Options, auth *shared.Auth, n int) error {
	r := auth.Request
	box, err := o.Storage.Mailbox(r.VaultId, n, o.Now())
	if err != nil {
		return err
	}
	if !auth.Member || box == nil || !bytes.Equal(box.Device, r.Device) || box.Slots[adapters.SlotPairJoiner] == nil {
		return enverrors.New(enverrors.Unauthorized, "Mailbox grant required")
	}

	return nil
}
