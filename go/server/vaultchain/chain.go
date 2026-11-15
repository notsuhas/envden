package vaultchain

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	x "github.com/notsuhas/envden/go/server/shared"
)

func Chain(o x.Options, vault []byte) (b.Signed[m.ManifestHeader], *d.State) {
	storage := o.Storage
	head := x.Must(storage.Head(vault))
	if head == nil {
		x.Fail(e.NotFound, "Missing head")
	}
	row := x.Must(storage.Header(vault, head))
	header := x.Must(b.Decode(b.SignedCodec(m.ManifestHeaderCodec), row.Bytes))
	key := b.Base32(vault)
	if cached, ok := o.ChainCache[key].(chainCache); ok && b.Equal(cached.head, header.Body.ListHead) {
		return header, cached.state
	}
	rows := x.Must(storage.Entries(vault, 0, header.Body.ListSeq, 0, 0))
	entries := make([]b.Signed[c.Entry], len(rows))
	for i, row := range rows {
		entries[i] = x.Must(b.Decode(b.SignedCodec(c.EntryCodec), row.Bytes))
	}
	result := x.Must(d.VerifyChain(entries))
	if result.Kind != "valid" {
		x.Fail(e.InvalidData, "Invalid stored chain")
	}
	if o.ChainCache != nil {
		o.ChainCache[key] = chainCache{header.Body.ListHead, result.State}
	}
	return header, result.State
}
func Membership(o x.Options, vault, device []byte) *members.DeviceRecord {
	if x.Must(o.Storage.Head(vault)) == nil {
		return nil
	}
	_, state := Chain(o, vault)
	member, ok := state.Devices[b.Base32(device)]
	if !ok {
		return nil
	}
	return &member
}
func RepairHistory(o x.Options, vault []byte) []m.ManifestHeader {
	v := x.Must(o.Storage.Vault(vault))
	result := []m.ManifestHeader{}
	if v == nil || v.Restored == nil {
		return result
	}
	point := x.Must(o.Storage.Header(vault, v.Restored.RestoredHead))
	if point == nil {
		return result
	}
	for _, row := range x.Must(o.Storage.Headers(vault, point.Seq+1, ^uint64(0), 0, 0)) {
		result = append(result, x.Must(b.Decode(b.SignedCodec(m.ManifestHeaderCodec), row.Bytes)).Body)
	}
	return result
}

type chainCache struct {
	head  []byte
	state *d.State
}
