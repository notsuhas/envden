package vault

import (
	"github.com/notsuhas/envden/go/cli/identity/name"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	e "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

func AddDeviceSwap(history History, device members.DeviceRecord, signer, objSk, epochKey []byte, op int, now int64, headerID, headerSK []byte) (m.Swap, error) {
	return b.Try(func() m.Swap {
		state := history.State
		before := history.Headers[len(history.Headers)-1]
		wrap := b.Must(epochs.SealWrap(epochKey, state.VaultId, state.Epoch, device.Id, device.EncPub))
		entry := b.Must(c.SignObject(p.EntryCodec, p.Entry{VaultId: state.VaultId, Seq: state.Seq + 1, Parent: state.Head, EntryPayload: p.EntryPayload{Kind: 1, Payload: e.AddDevice{Device: device, Wrap: wrap}}, Signer: signer}, objSk, "entry"))
		if b.Must(devices.ApplyEntry(state, entry)).Kind != "valid" {
			panic(errors.New(errors.Conflict, "Device name or keys cannot be added"))
		}
		head := b.Must(c.ObjectHash(m.ManifestHeaderCodec, before, "manifest"))
		h := before.Body
		h.Seq++
		h.Prev = head
		h.Op = op
		h.ListSeq = state.Seq + 1
		h.ListHead = b.Must(c.ObjectHash(p.EntryCodec, entry, "entry"))
		h.CreatedAt = uint64(now)
		h.Signer = headerID
		header := b.Must(c.SignObject(m.ManifestHeaderCodec, h, headerSK, "manifest"))
		return m.Swap{ExpectedHead: head, Entries: []b.Signed[p.Entry]{entry}, Header: header}
	})
}

func NamedForList(device members.DeviceRecord, history History) members.DeviceRecord {
	taken := []string{}
	for _, member := range history.State.Devices {
		taken = append(taken, member.Name)
	}
	device.Name = name.Unique(device.Name, taken)
	return device
}
