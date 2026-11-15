package completion

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	chainrepair "github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func CloseRepair(ctx context.Context, cxt *repair.Context, h shared.History, status serverprotocol.RepairStatus, password string) error {
	restored, err := client.Binary(status.RestoredHead)
	if err != nil {
		return err
	}

	index := -1
	for i, h := range h.Headers {
		if encoding.Equal(shared.HeaderHash(h), restored) {
			index = i
			break
		}
	}

	if index < 0 {
		return errors.New(errors.InvalidData, "Restored head is not on the chain")
	}

	evidence, err := files.OptionalRead(filepath.Join(cxt.Adapters.Home, "state", "repair-restored-"+client.Text(cxt.RepairID)))
	if err != nil {
		return err
	}

	evidenceIndex := -1
	if evidence != nil {
		for i, h := range h.Headers {
			if *evidence == client.Text(shared.HeaderHash(h)) {
				evidenceIndex = i
				break
			}
		}
	}

	if evidenceIndex < index {
		return errors.New(errors.InvalidData, "Restored head exceeds the observed restore point")
	}

	after := []manifests.ManifestHeader{}
	for _, h := range h.Headers[index+1:] {
		after = append(after, h.Body)
	}

	finish, err := repair.RepairLogin(ctx, cxt.Client, cxt.VaultID, password, chainrepair.RepairLoginDecision(after))
	if err != nil {
		return err
	}

	fields := manifests.Swap{}
	if finish.Kind == "registration" {
		raw, e := client.Binary(finish.Message)
		if e != nil {
			return e
		}

		fields.OpaqueRecord = &raw
	}

	entry, err := shared.SignEntry(cxt.Context, h, 6, entrypayloads.RepairDone{RepairId: cxt.RepairID, RestoredHead: restored})
	if err != nil {
		return err
	}

	fields.Entries = []encoding.Signed[codecs.Entry]{entry}
	swap, err := shared.AdminSwap(h, cxt.Identity, 12, cxt.Now(), fields)
	if err != nil {
		return err
	}

	if err = repair.SaveClose(cxt.Adapters, swap); err != nil {
		return err
	}

	raw, err := encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return err
	}

	finish.Swap = client.Text(raw)

	return shared.Send(ctx, cxt.Client, "/v1/repair/finish", "POST", finish)
}
