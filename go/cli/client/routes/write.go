package routes

import (
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"strconv"
)

var LoginStart = Route[p.MailboxWrite]{"/v1/opaque/login/start", "POST", p.MessageResponseSchema}
var LoginFinish = Route[p.LoginFinishResponse]{"/v1/opaque/login/finish", "POST", p.LoginFinishResponseSchema}
var RegistrationStart = Route[p.MailboxWrite]{"/v1/opaque/registration/start", "POST", p.MessageResponseSchema}
var RegistrationFinish = Route[p.KindResponse]{"/v1/opaque/registration/finish", "POST", p.RegistrationResponseSchema}
var SetUnlockPeriod = Route[p.UnlockPeriod]{"/v1/settings/unlock-period", "PUT", p.UnlockPeriodSchema}
var OpenMailbox = Route[p.MailboxOpened]{"/v1/pairing/mailboxes", "POST", p.MailboxOpenedSchema}
var CreateVault = Route[p.CommitResponse]{"/v1/vault", "POST", p.CommitResponseSchema}

func Swap(mailbox *int) Route[p.CommitResponse] {
	path := "/v1/swap"
	if mailbox != nil {
		path += "?mailbox=" + strconv.Itoa(*mailbox)
	}
	return Route[p.CommitResponse]{path, "POST", p.CommitResponseSchema}
}
func CloseMailbox(number int) Route[p.KindResponse] {
	return Route[p.KindResponse]{"/v1/pairing/mailboxes/" + strconv.Itoa(number), "DELETE", p.MailboxClosedSchema}
}
func MailboxSlot(number int, slot string) Route[p.MailboxSlotResponse] {
	return Route[p.MailboxSlotResponse]{"/v1/pairing/mailboxes/" + strconv.Itoa(number) + "/" + slot, "GET", p.MailboxSlotResponseSchema}
}
func WriteMailboxSlot(number int, slot string) Route[p.MailboxWriteResponse] {
	return Route[p.MailboxWriteResponse]{"/v1/pairing/mailboxes/" + strconv.Itoa(number) + "/" + slot, "PUT", p.MailboxWriteResponseSchema}
}
func Transfer(path, method string) Route[p.KindResponse] {
	return Route[p.KindResponse]{path, method, p.TransferResponseSchema}
}
