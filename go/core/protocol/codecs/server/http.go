package server

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/core/protocol/opaque"
)

func message(n int) rule {
	return func(v any) bool {
		s, ok := v.(string)
		if !ok {
			return false
		}
		_, err := opaque.OpaqueMessage(s, n)

		return err == nil
	}
}

type LoginStart struct {
	Purpose string `json:"purpose"`
	Message string `json:"message"`
}

type LoginFinish = LoginStart

type RegistrationStart struct {
	Message string `json:"message"`
}

type RegistrationFinish = RegistrationStart

var LoginStartSchema = Schema[LoginStart]{object(map[string]field{"purpose": req(enum("unlock", "kit")), "message": req(message(96))})}

var LoginFinishSchema = Schema[LoginFinish]{object(map[string]field{"purpose": req(enum("unlock", "kit")), "message": req(message(64))})}

var RegistrationStartSchema = Schema[RegistrationStart]{object(map[string]field{"message": req(message(32))})}

var RegistrationFinishSchema = Schema[RegistrationFinish]{object(map[string]field{"message": req(message(192))})}

type UnlockPeriod struct {
	Period *int64 `json:"period"`
}

var UnlockPeriodSchema = Schema[UnlockPeriod]{object(map[string]field{"period": req(nullable(func(v any) bool {
	n, ok := v.(json.Number)
	if !ok {
		return false
	}
	f, err := n.Float64()

	return err == nil && (f == 86400000 || f == 604800000 || f == 2592000000)
}))})}

type MailboxWrite struct {
	Message string `json:"message"`
}

var MailboxWriteSchema = Schema[MailboxWrite]{object(map[string]field{"message": req(maxString(5462))})}

var MessageResponseSchema = Schema[MailboxWrite]{object(map[string]field{"message": req(stringValue)})}

type HelloResponse struct {
	Hello string `json:"hello"`
}

var HelloResponseSchema = Schema[HelloResponse]{object(map[string]field{"hello": req(stringValue)})}

type MailboxOpened struct {
	Number    int   `json:"number"`
	ExpiresAt int64 `json:"expiresAt"`
}

var MailboxOpenedSchema = Schema[MailboxOpened]{object(map[string]field{"number": req(func(v any) bool {
	if !integer(v) {
		return false
	}
	n, _ := v.(json.Number).Float64()

	return n >= 1 && n <= 999
}), "expiresAt": req(integer)})}

type MailboxSlotResponse struct {
	Message   *string `json:"message,omitempty"`
	Kind      string  `json:"kind,omitempty"`
	ExpiresAt int64   `json:"expiresAt"`
}

var MailboxSlotResponseSchema = Schema[MailboxSlotResponse]{union(object(map[string]field{"message": req(stringValue), "expiresAt": req(integer)}), object(map[string]field{"kind": req(enum("pending")), "expiresAt": req(integer)}))}

type MailboxWriteResponse struct {
	Kind      string `json:"kind"`
	ExpiresAt int64  `json:"expiresAt"`
}

var MailboxWriteResponseSchema = Schema[MailboxWriteResponse]{object(map[string]field{"kind": req(enum("written", "identical")), "expiresAt": req(integer)})}

func DecodeMailboxSlot(raw []byte) (string, error) {
	return (Schema[string]{enum("KE1", "KE2", "KE3", "PairJoiner")}).Decode(raw)
}
