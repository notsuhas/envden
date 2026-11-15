package completion

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	r "github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"path/filepath"
)

func CloseRepair(ctx context.Context, cxt *repair.Context, h shared.History, status s.RepairStatus, password string) error {
	restored, err := client.Binary(status.RestoredHead)
	if err != nil {
		return err
	}
	index := -1
	for i, h := range h.Headers {
		if b.Equal(shared.HeaderHash(h), restored) {
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
	after := []m.ManifestHeader{}
	for _, h := range h.Headers[index+1:] {
		after = append(after, h.Body)
	}
	finish, err := repair.RepairLogin(ctx, cxt.Client, cxt.VaultID, password, r.RepairLoginDecision(after))
	if err != nil {
		return err
	}
	fields := m.Swap{}
	if finish.Kind == "registration" {
		raw, e := client.Binary(finish.Message)
		if e != nil {
			return e
		}
		fields.OpaqueRecord = &raw
	}
	entry, err := shared.SignEntry(cxt.Context, h, 6, p.RepairDone{RepairId: cxt.RepairID, RestoredHead: restored})
	if err != nil {
		return err
	}
	fields.Entries = []b.Signed[c.Entry]{entry}
	swap, err := shared.AdminSwap(h, cxt.Identity, 12, cxt.Now(), fields)
	if err != nil {
		return err
	}
	if err = repair.SaveClose(cxt.Adapters, swap); err != nil {
		return err
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		return err
	}
	finish.Swap = client.Text(raw)
	return shared.Send(ctx, cxt.Client, "/v1/repair/finish", "POST", finish)
}
