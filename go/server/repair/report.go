package repair

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/repair"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func StoreReport(o x.Options, auth *x.Auth, data []byte) s.KindResponse {
	authn.RequireRepair(o, auth)
	report := x.Input(func() b.Signed[s.RepairReport] { return x.Must(b.Decode(b.SignedCodec(s.RepairReportCodec), data)) })
	id := auth.Request.VaultId
	_, state := v.Chain(o, id)
	hashes := map[string]bool{}
	if x.Must(o.Storage.Header(id, report.Body.Head)) != nil {
		hashes[b.Base32(report.Body.Head)] = true
	}
	reports := x.Must(chain.FilterRepairReports(chain.ReportsInput{Reports: []b.Signed[s.RepairReport]{report}, RepairId: x.Must(o.Storage.Vault(id)).Restored.FinishProgress, State: state, HeaderHashes: hashes}))
	if len(reports) == 0 || b.Base32(report.Body.Signer) != b.Base32(auth.Request.Device) {
		x.Fail(e.InvalidData, "Invalid repair report")
	}
	x.Check(o.Storage.WriteState(id, []a.StateWrite{{Kind: a.StateRepairReport, Key: report.Body.Signer, Bytes: data}}))
	return s.KindResponse{Kind: "stored"}
}
