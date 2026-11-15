package routes

import (
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"net/url"
	"strconv"
)

var Devices = Route[p.DevicesResponse]{"/v1/devices", "GET", p.DevicesResponseSchema}
var Blobs = Route[p.ObjectsResponse]{"/v1/blobs", "GET", p.ObjectsResponseSchema}
var UnlockWindow = Route[p.UnlockWindow]{"/v1/unlock-window", "GET", p.UnlockWindowSchema}
var UnlockPeriod = Route[p.UnlockPeriod]{"/v1/settings/unlock-period", "GET", p.UnlockPeriodSchema}
var RepairStatus = Route[p.RepairStatus]{"/v1/repair/status", "GET", p.RepairStatusSchema}
var RepairReports = Route[p.ObjectsResponse]{"/v1/repair/reports", "GET", p.ObjectsResponseSchema}
var PairingApprover = Route[p.MailboxWrite]{"/v1/pairing/approver", "GET", p.MessageResponseSchema}

func Range(resource string, from uint64, to *uint64) Route[p.ObjectsResponse] {
	path := "/v1/" + resource + "?from=" + strconv.FormatUint(from, 10)
	if to != nil {
		path += "&to=" + strconv.FormatUint(*to, 10)
	}
	return Route[p.ObjectsResponse]{path, "GET", p.ObjectsResponseSchema}
}
func Object(resource, hash string) string { return "/v1/" + resource + "/" + url.PathEscape(hash) }

const Head = "/v1/head"
const Envelope = "/v1/envelope"
const MoveSKPublic = "/v1/move/sk-pub"
