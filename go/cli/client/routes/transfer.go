package routes

import (
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

var MoveDiscard = Transfer("/v1/move/discard", "POST")

var MoveSession = Transfer("/v1/move/session", "POST")

var MoveFreeze = Transfer("/v1/move/freeze", "POST")

var MoveUnfreeze = Transfer("/v1/move/unfreeze", "POST")

var MoveChain = Route[serverprotocol.CommitResponse]{"/v1/move/chain", "POST", serverprotocol.CommitResponseSchema}

var MoveHistory = Route[serverprotocol.CommitResponse]{"/v1/move/history", "POST", serverprotocol.CommitResponseSchema}

var RepairChain = Route[serverprotocol.CommitResponse]{"/v1/repair/chain", "POST", serverprotocol.CommitResponseSchema}

var RepairHistory = Route[serverprotocol.CommitResponse]{"/v1/repair/history", "POST", serverprotocol.CommitResponseSchema}

var RepairFinish = Route[serverprotocol.CommitResponse]{"/v1/repair/finish", "POST", serverprotocol.CommitResponseSchema}

var MovePeriod = Route[serverprotocol.UnlockPeriod]{"/v1/move/period", "GET", serverprotocol.UnlockPeriodSchema}

var SetMovePeriod = Transfer("/v1/move/period", "PUT")

var UploadRepairReport = Transfer("/v1/repair/report", "PUT")

func Material(scope, kind, hash string) Route[serverprotocol.KindResponse] {
	return Transfer(Object(scope+"/material/"+kind, hash), "PUT")
}

func UploadBlob(hash string) Route[serverprotocol.KindResponse] {
	return Transfer(Object("blobs", hash), "PUT")
}
