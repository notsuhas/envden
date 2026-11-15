package vaultchain

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/shared"
)

func Chain(o shared.Options, vault []byte) (encoding.Signed[manifests.ManifestHeader], *devicechain.State, error) {
	storage := o.Storage
	head, err := storage.Head(vault)
	if err != nil {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, err
	}
	if head == nil {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, enverrors.New(enverrors.NotFound, "Missing head")
	}
	row, err := storage.Header(vault, head)
	if err != nil {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, err
	}

	header, err := encoding.Decode(encoding.SignedCodec(manifests.ManifestHeaderCodec), row.Bytes)
	if err != nil {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, err
	}

	key := encoding.Base32(vault)
	cached, ok := o.ChainCache[key].(chainCache)
	if ok && encoding.Equal(cached.head, header.Body.ListHead) {
		return header, cached.state, nil
	}
	rows, err := storage.Entries(vault, 0, header.Body.ListSeq, 0, 0)
	if err != nil {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, err
	}

	entries := make([]encoding.Signed[codecs.Entry], len(rows))
	for i, row := range rows {
		decoded, err := encoding.Decode(encoding.SignedCodec(codecs.EntryCodec), row.Bytes)
		if err != nil {
			return *new(encoding.Signed[manifests.ManifestHeader]), nil, err
		}

		entries[i] = decoded
	}
	result, err := devicechain.VerifyChain(entries)
	if err != nil {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, err
	}
	if result.Kind != "valid" {
		return *new(encoding.Signed[manifests.ManifestHeader]), nil, enverrors.New(enverrors.InvalidData, "Invalid stored chain")
	}
	if o.ChainCache != nil {
		o.ChainCache[key] = chainCache{header.Body.ListHead, result.State}
	}

	return header, result.State, nil
}

func Membership(o shared.Options, vault, device []byte) (*members.DeviceRecord, error) {
	head, err := o.Storage.Head(vault)
	if err != nil {
		return nil, err
	}
	if head == nil {
		return nil, nil
	}
	chain1, chain2, err := Chain(o, vault)
	if err != nil {
		return nil, err
	}

	_, state := chain1, chain2
	member, ok := state.Devices[encoding.Base32(device)]
	if !ok {
		return nil, nil
	}

	return &member, nil
}

func RepairHistory(o shared.Options, vault []byte) ([]manifests.ManifestHeader, error) {
	v, err := o.Storage.Vault(vault)
	if err != nil {
		return nil, err
	}

	result := []manifests.ManifestHeader{}
	if v == nil || v.Restored == nil {
		return result, nil
	}
	point, err := o.Storage.Header(vault, v.Restored.RestoredHead)
	if err != nil {
		return nil, err
	}
	if point == nil {
		return result, nil
	}
	headers, err := o.Storage.Headers(vault, point.Seq+1, ^uint64(0), 0, 0)
	if err != nil {
		return nil, err
	}

	for _, row := range headers {
		decoded, err := encoding.Decode(encoding.SignedCodec(manifests.ManifestHeaderCodec), row.Bytes)
		if err != nil {
			return nil, err
		}

		result = append(result, decoded.Body)
	}

	return result, nil
}

type chainCache struct {
	head  []byte
	state *devicechain.State
}
