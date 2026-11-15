package vault

import (
	"github.com/notsuhas/envden/go/cli/identity/name"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

func AddDeviceSwap(history History, device members.DeviceRecord, signer, objSk, epochKey []byte, op int, now int64, headerID, headerSK []byte) (manifests.Swap, error) {
	state := history.State
	before := history.Headers[len(history.Headers)-1]
	wrap, err := epochs.SealWrap(epochKey, state.VaultId, state.Epoch, device.Id, device.EncPub)
	if err != nil {
		return manifests.Swap{}, err
	}

	entry, err := crypto.SignObject(codecs.EntryCodec, codecs.Entry{VaultId: state.VaultId, Seq: state.Seq + 1, Parent: state.Head, EntryPayload: codecs.EntryPayload{Kind: 1, Payload: entrypayloads.AddDevice{Device: device, Wrap: wrap}}, Signer: signer}, objSk, "entry")
	if err != nil {
		return manifests.Swap{}, err
	}

	applied, err := devices.ApplyEntry(state, entry)
	if err != nil {
		return manifests.Swap{}, err
	}

	if applied.Kind != "valid" {
		return manifests.Swap{}, errors.New(errors.Conflict, "Device name or keys cannot be added")
	}

	head, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, before, "manifest")
	if err != nil {
		return manifests.Swap{}, err
	}

	h := before.Body
	h.Seq++
	h.Prev = head
	h.Op = op
	h.ListSeq = state.Seq + 1
	h.ListHead, err = crypto.ObjectHash(codecs.EntryCodec, entry, "entry")
	if err != nil {
		return manifests.Swap{}, err
	}

	h.CreatedAt = uint64(now) //nolint:gosec // The timestamp conversion matches the existing protocol encoding.
	h.Signer = headerID
	header, err := crypto.SignObject(manifests.ManifestHeaderCodec, h, headerSK, "manifest")
	if err != nil {
		return manifests.Swap{}, err
	}

	return manifests.Swap{ExpectedHead: head, Entries: []encoding.Signed[codecs.Entry]{entry}, Header: header}, nil
}

func NamedForList(device members.DeviceRecord, history History) members.DeviceRecord {
	taken := []string{}
	for _, member := range history.State.Devices {
		taken = append(taken, member.Name)
	}

	device.Name = name.Unique(device.Name, taken)

	return device
}
