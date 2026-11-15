package repair

import (
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/repair"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func StoreReport(o shared.Options, auth *shared.Auth, data []byte) (wire.KindResponse, error) {
	if err := authn.RequireRepair(o, auth); err != nil {
		return wire.KindResponse{}, err
	}
	report, err := shared.Input(func() (encoding.Signed[wire.RepairReport], error) {
		return encoding.Decode(encoding.SignedCodec(wire.RepairReportCodec), data)
	})
	if err != nil {
		return wire.KindResponse{}, err
	}

	id := auth.Request.VaultId
	chain1, chain2, err := vaultchain.Chain(o, id)
	if err != nil {
		return wire.KindResponse{}, err
	}

	_, state := chain1, chain2
	hashes := map[string]bool{}
	header, err := o.Storage.Header(id, report.Body.Head)
	if err != nil {
		return wire.KindResponse{}, err
	}
	if header != nil {
		hashes[encoding.Base32(report.Body.Head)] = true
	}
	vault, err := o.Storage.Vault(id)
	if err != nil {
		return wire.KindResponse{}, err
	}
	reports, err := chain.FilterRepairReports(chain.ReportsInput{Reports: []encoding.Signed[wire.RepairReport]{report}, RepairId: vault.Restored.FinishProgress, State: state, HeaderHashes: hashes})
	if err != nil {
		return wire.KindResponse{}, err
	}
	if len(reports) == 0 || encoding.Base32(report.Body.Signer) != encoding.Base32(auth.Request.Device) {
		return wire.KindResponse{}, enverrors.New(enverrors.InvalidData, "Invalid repair report")
	}
	if err := o.Storage.WriteState(id, []adapters.StateWrite{{Kind: adapters.StateRepairReport, Key: report.Body.Signer, Bytes: data}}); err != nil {
		return wire.KindResponse{}, err
	}

	return wire.KindResponse{Kind: "stored"}, nil
}
