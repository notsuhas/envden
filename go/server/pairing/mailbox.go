package pairing

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	opaque "github.com/notsuhas/envden/go/core/protocol/opaque"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
	"strconv"
)

var namespace = make([]byte, 32)

func lookup(o x.Options, id []byte, kind, key string) []byte {
	if !bytes.Equal(id, namespace) {
		return id
	}
	found := x.Must(o.Storage.State(namespace, a.StatePairingIndex, []byte(kind+"/"+key)))
	if found == nil {
		return namespace
	}
	return found
}
func MailboxVault(o x.Options, id []byte, number int) []byte {
	return lookup(o, id, "mailbox", strconv.Itoa(number))
}
func index(o x.Options, kind, key string, id []byte) {
	x.Check(o.Storage.WriteState(namespace, []a.StateWrite{{Kind: a.StatePairingIndex, Key: []byte(kind + "/" + key), Bytes: id}}))
}
func Open(o x.Options, auth *x.Auth) s.MailboxOpened {
	return x.Transaction(o.Storage, func() s.MailboxOpened {
		fresh := *auth
		r := auth.Request
		fresh.Member = v.Membership(o, r.VaultId, r.Device) != nil
		authn.RequireGate(o, &fresh, "fresh")
		box := x.Must(o.Storage.OpenMailbox(r.VaultId, r.Device, o.Now()))
		if box == nil {
			x.Fail(e.RateLimited, "Mailbox limit reached")
		}
		x.Check(o.Storage.WriteState(r.VaultId, []a.StateWrite{{Kind: a.StateMailboxJoiner, Key: binding(box.Number)}}))
		index(o, "mailbox", strconv.Itoa(box.Number), r.VaultId)
		return s.MailboxOpened{Number: box.Number, ExpiresAt: box.ExpiresAt}
	})
}
func binding(n int) []byte { return []byte{byte(n >> 8), byte(n)} }
func MailboxSide(owner, write bool, slot a.MailboxSlot) bool {
	responder := slot == a.SlotKE2
	if write {
		return owner == responder
	}
	return responder || owner
}

type access struct {
	box            *a.StoredMailbox
	key, bound, id []byte
}

func Accessible(o x.Options, auth *x.Auth, n int, slot a.MailboxSlot, write bool) access {
	id := MailboxVault(o, auth.Request.VaultId, n)
	box := x.Must(o.Storage.Mailbox(id, n, o.Now()))
	if box == nil {
		x.Fail(e.NotFound, "Mailbox closed")
	}
	owner := bytes.Equal(box.Device, auth.Request.Device)
	if !MailboxSide(owner, write, slot) {
		x.Fail(e.Unauthorized, "Wrong mailbox side")
	}
	key := binding(n)
	bound := x.Must(o.Storage.State(id, a.StateMailboxJoiner, key))
	if !owner && bound != nil && !bytes.Equal(bound, auth.Request.Device) {
		x.Fail(e.Unauthorized, "Wrong joiner")
	}
	if !owner && bound == nil && (!write || slot != a.SlotKE1) {
		x.Fail(e.Unauthorized, "Joiner not bound")
	}
	return access{box, key, bound, id}
}
func Write(o x.Options, auth *x.Auth, n int, slot a.MailboxSlot, message string) s.MailboxWriteResponse {
	access := Accessible(o, auth, n, slot, true)
	data := x.Binary(message)
	prior := access.box.Slots[slot]
	if prior != nil && !bytes.Equal(prior, data) {
		x.Check(o.Storage.CloseMailbox(access.id, n))
		x.Fail(e.Conflict, "Mailbox closed")
	}
	if len(data) > 4096 {
		x.Fail(e.InvalidInput, "Message too large")
	}
	lengths := map[a.MailboxSlot]int{a.SlotKE1: 96, a.SlotKE2: 320, a.SlotKE3: 64}
	if length, ok := lengths[slot]; ok {
		x.Input(func() string { return x.Must(opaque.OpaqueMessage(message, length)) })
	}
	result := x.Must(o.Storage.WriteMailbox(access.id, n, slot, data, o.Now()))
	if result == "closed" {
		x.Fail(e.Conflict, "Mailbox closed")
	}
	if result == "out-of-order" {
		x.Fail(e.Conflict, "Mailbox slot out of order")
	}
	if slot == a.SlotKE1 && (access.bound == nil || access.box.Slots[a.SlotKE1] == nil) {
		x.Check(o.Storage.WriteState(access.id, []a.StateWrite{{Kind: a.StateMailboxJoiner, Key: access.key, Bytes: auth.Request.Device}}))
	}
	if slot == a.SlotPairJoiner {
		index(o, "approver", x.Text(auth.Request.Device), access.id)
	}
	return s.MailboxWriteResponse{Kind: string(result), ExpiresAt: access.box.ExpiresAt}
}
func Read(o x.Options, auth *x.Auth, n int, slot a.MailboxSlot) s.MailboxSlotResponse {
	access := Accessible(o, auth, n, slot, false)
	result := s.MailboxSlotResponse{ExpiresAt: access.box.ExpiresAt}
	data := access.box.Slots[slot]
	if data != nil {
		text := x.Text(data)
		result.Message = &text
	} else {
		result.Kind = "pending"
	}
	return result
}
func Close(o x.Options, auth *x.Auth, n int) s.KindResponse {
	r := auth.Request
	box := x.Must(o.Storage.Mailbox(r.VaultId, n, o.Now()))
	if box == nil || !bytes.Equal(box.Device, r.Device) {
		x.Fail(e.Unauthorized, "Wrong mailbox owner")
	}
	x.Check(o.Storage.CloseMailbox(r.VaultId, n))
	return s.KindResponse{Kind: "closed"}
}
func Approver(o x.Options, auth *x.Auth) s.MailboxWrite {
	r := auth.Request
	id := lookup(o, r.VaultId, "approver", x.Text(r.Device))
	data := x.Must(o.Storage.Approver(id, r.Device, o.Now()))
	if data == nil {
		x.Fail(e.NotFound, "Approver unavailable")
	}
	return s.MailboxWrite{Message: x.Text(data)}
}
func RequireGrant(o x.Options, auth *x.Auth, n int) {
	r := auth.Request
	box := x.Must(o.Storage.Mailbox(r.VaultId, n, o.Now()))
	if !auth.Member || box == nil || !bytes.Equal(box.Device, r.Device) || box.Slots[a.SlotPairJoiner] == nil {
		x.Fail(e.Unauthorized, "Mailbox grant required")
	}
}
