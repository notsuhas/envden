package vault

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	x "github.com/notsuhas/envden/go/server/shared"
)

func Versions(entries []m.FileEntry) []a.FileVersion {
	result := make([]a.FileVersion, len(entries))
	for i, e := range entries {
		result[i] = a.FileVersion{FileID: e.FileId, Version: e.Version, Tombstone: e.State == 2 || e.State == 4}
		if e.State == 1 || e.State == 3 {
			result[i].BlobHash = e.BlobHash
		}
	}
	return result
}
func StoredSwap(swap m.Swap, digest []byte) a.StoredSwap {
	h := swap.Header.Body
	limit := 1 + 24 + 16 + 2 + 32 + 4 + 32 + 4 + 36*(h.Epoch-1)
	if swap.Keyring != nil && len(*swap.Keyring) > limit {
		x.Fail(e.InvalidData, "Keyring exceeds epoch history size")
	}
	state := []a.StateWrite{}
	for _, write := range []struct {
		kind  a.StateKind
		key   []byte
		value *[]byte
	}{{a.StateKeyring, h.KeyringHash, swap.Keyring}, {a.StateEnvelope, []byte{}, swap.Envelope}, {a.StateSKPub, []byte{}, swap.SkPub}, {a.StateOpaqueRecord, []byte{}, swap.OpaqueRecord}} {
		if write.value != nil {
			state = append(state, a.StateWrite{Kind: write.kind, Key: write.key, Bytes: *write.value})
		}
	}
	result := a.StoredSwap{Header: a.StoredHeader{StoredObject: a.StoredObject{Hash: x.Must(cr.ObjectHash(m.ManifestHeaderCodec, swap.Header, "manifest")), Bytes: b.SignedCodec(m.ManifestHeaderCodec).Write(swap.Header)}, Seq: h.Seq}, Entries: []a.StoredHeader{}, FilesHash: h.FilesHash, BodyDigest: digest, State: state}
	for _, entry := range swap.Entries {
		result.Entries = append(result.Entries, a.StoredHeader{StoredObject: a.StoredObject{Hash: x.Must(cr.ObjectHash(c.EntryCodec, entry, "entry")), Bytes: b.SignedCodec(c.EntryCodec).Write(entry)}, Seq: entry.Body.Seq})
	}
	if swap.Files != nil {
		data := m.FilesCodec.Write(*swap.Files)
		result.Files = &a.StoredFiles{StoredObject: a.StoredObject{Hash: cr.H("files", data), Bytes: data}, RetainForever: h.Op == 11, Versions: Versions(swap.Files.Entries)}
	}
	return result
}
func zero(data []byte) bool {
	for _, n := range data {
		if n != 0 {
			return false
		}
	}
	return true
}
