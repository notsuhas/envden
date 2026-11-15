package routes

import p "github.com/notsuhas/envden/go/core/protocol/codecs/server"

var MoveDiscard = Transfer("/v1/move/discard", "POST")
var MoveSession = Transfer("/v1/move/session", "POST")
var MoveFreeze = Transfer("/v1/move/freeze", "POST")
var MoveUnfreeze = Transfer("/v1/move/unfreeze", "POST")
var MoveChain = Route[p.CommitResponse]{"/v1/move/chain", "POST", p.CommitResponseSchema}
var MoveHistory = Route[p.CommitResponse]{"/v1/move/history", "POST", p.CommitResponseSchema}
var RepairChain = Route[p.CommitResponse]{"/v1/repair/chain", "POST", p.CommitResponseSchema}
var RepairHistory = Route[p.CommitResponse]{"/v1/repair/history", "POST", p.CommitResponseSchema}
var RepairFinish = Route[p.CommitResponse]{"/v1/repair/finish", "POST", p.CommitResponseSchema}
var MovePeriod = Route[p.UnlockPeriod]{"/v1/move/period", "GET", p.UnlockPeriodSchema}
var SetMovePeriod = Transfer("/v1/move/period", "PUT")
var UploadRepairReport = Transfer("/v1/repair/report", "PUT")

func Material(scope, kind, hash string) Route[p.KindResponse] {
	return Transfer(Object(scope+"/material/"+kind, hash), "PUT")
}
func UploadBlob(hash string) Route[p.KindResponse] { return Transfer(Object("blobs", hash), "PUT") }
