package routes

import (
	"net/url"
	"strconv"

	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

var Devices = Route[serverprotocol.DevicesResponse]{"/v1/devices", "GET", serverprotocol.DevicesResponseSchema}

var Blobs = Route[serverprotocol.ObjectsResponse]{"/v1/blobs", "GET", serverprotocol.ObjectsResponseSchema}

var UnlockWindow = Route[serverprotocol.UnlockWindow]{"/v1/unlock-window", "GET", serverprotocol.UnlockWindowSchema}

var UnlockPeriod = Route[serverprotocol.UnlockPeriod]{"/v1/settings/unlock-period", "GET", serverprotocol.UnlockPeriodSchema}

var RepairStatus = Route[serverprotocol.RepairStatus]{"/v1/repair/status", "GET", serverprotocol.RepairStatusSchema}

var RepairReports = Route[serverprotocol.ObjectsResponse]{"/v1/repair/reports", "GET", serverprotocol.ObjectsResponseSchema}

var PairingApprover = Route[serverprotocol.MailboxWrite]{"/v1/pairing/approver", "GET", serverprotocol.MessageResponseSchema}

func Range(resource string, from uint64, to *uint64) Route[serverprotocol.ObjectsResponse] {
	path := "/v1/" + resource + "?from=" + strconv.FormatUint(from, 10)
	if to != nil {
		path += "&to=" + strconv.FormatUint(*to, 10)
	}

	return Route[serverprotocol.ObjectsResponse]{path, "GET", serverprotocol.ObjectsResponseSchema}
}

func Object(resource, hash string) string { return "/v1/" + resource + "/" + url.PathEscape(hash) }

const Head = "/v1/head"

const Envelope = "/v1/envelope"

const MoveSKPublic = "/v1/move/sk-pub"
