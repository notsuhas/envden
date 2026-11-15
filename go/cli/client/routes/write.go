package routes

import (
	"strconv"

	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

var LoginStart = Route[serverprotocol.MailboxWrite]{"/v1/opaque/login/start", "POST", serverprotocol.MessageResponseSchema}

var LoginFinish = Route[serverprotocol.LoginFinishResponse]{"/v1/opaque/login/finish", "POST", serverprotocol.LoginFinishResponseSchema}

var RegistrationStart = Route[serverprotocol.MailboxWrite]{"/v1/opaque/registration/start", "POST", serverprotocol.MessageResponseSchema}

var RegistrationFinish = Route[serverprotocol.KindResponse]{"/v1/opaque/registration/finish", "POST", serverprotocol.RegistrationResponseSchema}

var SetUnlockPeriod = Route[serverprotocol.UnlockPeriod]{"/v1/settings/unlock-period", "PUT", serverprotocol.UnlockPeriodSchema}

var OpenMailbox = Route[serverprotocol.MailboxOpened]{"/v1/pairing/mailboxes", "POST", serverprotocol.MailboxOpenedSchema}

var CreateVault = Route[serverprotocol.CommitResponse]{"/v1/vault", "POST", serverprotocol.CommitResponseSchema}

func Swap(mailbox *int) Route[serverprotocol.CommitResponse] {
	path := "/v1/swap"
	if mailbox != nil {
		path += "?mailbox=" + strconv.Itoa(*mailbox)
	}

	return Route[serverprotocol.CommitResponse]{path, "POST", serverprotocol.CommitResponseSchema}
}

func CloseMailbox(number int) Route[serverprotocol.KindResponse] {
	return Route[serverprotocol.KindResponse]{"/v1/pairing/mailboxes/" + strconv.Itoa(number), "DELETE", serverprotocol.MailboxClosedSchema}
}

func MailboxSlot(number int, slot string) Route[serverprotocol.MailboxSlotResponse] {
	return Route[serverprotocol.MailboxSlotResponse]{"/v1/pairing/mailboxes/" + strconv.Itoa(number) + "/" + slot, "GET", serverprotocol.MailboxSlotResponseSchema}
}

func WriteMailboxSlot(number int, slot string) Route[serverprotocol.MailboxWriteResponse] {
	return Route[serverprotocol.MailboxWriteResponse]{"/v1/pairing/mailboxes/" + strconv.Itoa(number) + "/" + slot, "PUT", serverprotocol.MailboxWriteResponseSchema}
}

func Transfer(path, method string) Route[serverprotocol.KindResponse] {
	return Route[serverprotocol.KindResponse]{path, method, serverprotocol.TransferResponseSchema}
}
