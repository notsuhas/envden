package server

import "encoding/json"
import e "github.com/notsuhas/envden/go/core/errors"

type KindResponse struct {
	Kind string `json:"kind"`
}

func kindSchema(kinds ...string) Schema[KindResponse] {
	return Schema[KindResponse]{object(map[string]field{"kind": req(enum(kinds...))})}
}

var PendingResponseSchema = kindSchema("pending")

type DeviceStatus struct {
	Id            string  `json:"id"`
	ClientVersion *string `json:"clientVersion"`
	Confirmed     bool    `json:"confirmed"`
}
type DevicesResponse struct {
	Devices []DeviceStatus `json:"devices"`
}

var DevicesResponseSchema = Schema[DevicesResponse]{object(map[string]field{"devices": req(array(object(map[string]field{"id": req(binaryString(32)), "clientVersion": req(nullable(stringValue)), "confirmed": req(boolValue)})))})}

type ObjectsResponse struct {
	Objects []string `json:"objects"`
}

var ObjectsResponseSchema = Schema[ObjectsResponse]{object(map[string]field{"objects": req(array(binaryString(3200182)))})}

type CommitResponse struct {
	Kind string  `json:"kind"`
	Head *string `json:"head,omitempty"`
}

var CommitResponseSchema = Schema[CommitResponse]{union(object(map[string]field{"kind": req(enum("committed", "retry-of-committed"))}), object(map[string]field{"kind": req(enum("head-moved")), "head": optional(binaryString(32))}))}

type RepairStatus struct {
	RestoredHead string `json:"restoredHead"`
	RepairId     string `json:"repairId"`
}

var RepairStatusSchema = Schema[RepairStatus]{object(map[string]field{"restoredHead": req(binaryString(32)), "repairId": req(binaryString(32))})}
var TransferResponseSchema = kindSchema("moving", "frozen", "unfrozen", "uploaded", "stored", "updated")

type RepairFinish struct {
	Kind    string `json:"kind"`
	Purpose string `json:"purpose,omitempty"`
	Message string `json:"message"`
	Swap    string `json:"swap"`
}

var RepairFinishSchema = Schema[RepairFinish]{union(object(map[string]field{"kind": req(enum("login")), "purpose": req(enum("unlock")), "message": req(message(64)), "swap": req(binaryString(3200182))}), object(map[string]field{"kind": req(enum("registration")), "message": req(message(192)), "swap": req(binaryString(3200182))}))}

type ErrorResponse struct {
	Error string  `json:"error"`
	Hint  *string `json:"hint,omitempty"`
}

var ErrorResponseSchema = Schema[ErrorResponse]{object(map[string]field{"error": req(func(v any) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	_, ok = e.ParseCode(s)

	return ok
}), "hint": optional(stringValue)})}

type UnlockWindow struct {
	UnlockedUntil *int64 `json:"unlockedUntil"`
	FreshUntil    int64  `json:"freshUntil"`
}

var UnlockWindowSchema = Schema[UnlockWindow]{object(map[string]field{"unlockedUntil": req(nullable(count)), "freshUntil": req(count)})}

type LoginFinishResponse struct {
	Kind          string `json:"kind"`
	UnlockedUntil *int64 `json:"unlockedUntil,omitempty"`
	FreshUntil    *int64 `json:"freshUntil,omitempty"`
}

var LoginFinishResponseSchema = Schema[LoginFinishResponse]{union(object(map[string]field{"kind": req(enum("ticket", "staged"))}), object(map[string]field{"kind": req(enum("unlocked")), "unlockedUntil": req(nullable(count)), "freshUntil": req(count)}))}
var RegistrationResponseSchema = kindSchema("registered")
var MailboxClosedSchema = kindSchema("closed")

func (r LoginFinishResponse) MarshalJSON() ([]byte, error) {
	if r.Kind == "unlocked" {
		return json.Marshal(struct {
			Kind          string `json:"kind"`
			UnlockedUntil *int64 `json:"unlockedUntil"`
			FreshUntil    *int64 `json:"freshUntil"`
		}{r.Kind, r.UnlockedUntil, r.FreshUntil})
	}
	return json.Marshal(KindResponse{Kind: r.Kind})
}
