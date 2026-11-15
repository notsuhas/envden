package repair

import (
	"context"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

type Result struct {
	Kind          string
	Devices       []string
	Missing, Lost []content.FileName
	Report        *string
	ReplaceKit    bool
}

func SaveClose(a contracts.Adapters, swap manifests.Swap) error {
	raw, err := encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return err
	}

	return files.AtomicWrite(filepath.Join(a.Home, "state", "repair-close"), []byte(client.Text(raw)), a.Now)
}

func ResumeClose(ctx context.Context, a contracts.Adapters, token string, now func() int64, fetch client.Fetch) (*Result, error) {
	path := filepath.Join(a.Home, "state", "repair-close")
	saved, err := files.OptionalRead(path)
	if err != nil || saved == nil {
		return nil, err
	}

	raw, err := client.Binary(*saved)
	if err != nil {
		return nil, err
	}

	swap, err := encoding.Decode(manifests.SwapCodec, raw)
	if err != nil {
		return nil, err
	}

	decoded, err := proofs.DecodeToken("repair", token)
	if err != nil {
		return nil, err
	}

	repairID := crypto.H("repair-id", decoded.Secret)
	var close *entrypayloads.RepairDone
	if len(swap.Entries) > 0 {
		if pld, ok := swap.Entries[0].Body.Payload.(entrypayloads.RepairDone); ok {
			close = &pld
		}
	}

	if close == nil || !encoding.Equal(close.RepairId, repairID) {
		return nil, os.Remove(path)
	}

	c, err := shared.AdminContext(ctx, a, now, fetch)
	if err != nil {
		return nil, err
	}

	h, err := shared.ReadHistory(ctx, c.Client, c.VaultID)
	if errors.Is(err, errors.RestoredMode) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	if !shared.HistoryHasHeader(h, shared.HeaderHash(swap.Header)) {
		if err = os.Remove(path); err != nil {
			return nil, err
		}

		return nil, errors.New(errors.Fork, "Repair close is not on the server chain")
	}

	if err = shared.AcceptHistory(ctx, c, h); err != nil {
		return nil, err
	}

	envelope, err := shared.OptionalObject(ctx, c.Client, "/v1/envelope")
	if err != nil {
		return nil, err
	}

	index := -1
	for i, h := range h.Headers {
		if encoding.Equal(shared.HeaderHash(h), close.RestoredHead) {
			index = i
			break
		}
	}

	if index < 0 {
		return nil, errors.New(errors.InvalidData, "Missing restored checkpoint")
	}

	after := []manifests.ManifestHeader{}
	for _, h := range h.Headers[index+1:] {
		if h.Body.Seq < swap.Header.Body.Seq {
			after = append(after, h.Body)
		}
	}

	report, err := files.OptionalRead(filepath.Join(a.Home, "state", "repair-report-"+client.Text(repairID)))
	if err != nil {
		return nil, err
	}

	result := &Result{Kind: "finished", Report: report, ReplaceKit: repair.RefuseSecretKeyProof(after, envelope != nil && encoding.Equal(crypto.H("envelope-blob", envelope), swap.Header.Body.EnvelopeHash))}

	return result, os.Remove(path)
}
