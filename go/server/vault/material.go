package vault

import (
	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Versions(entries []manifests.FileEntry) []adapters.FileVersion {
	result := make([]adapters.FileVersion, len(entries))
	for i, e := range entries {
		result[i] = adapters.FileVersion{FileID: e.FileId, Version: e.Version, Tombstone: e.State == 2 || e.State == 4}
		if e.State == 1 || e.State == 3 {
			result[i].BlobHash = e.BlobHash
		}
	}

	return result
}

func StoredSwap(swap manifests.Swap, digest []byte) (adapters.StoredSwap, error) {
	h := swap.Header.Body
	limit := 1 + 24 + 16 + 2 + 32 + 4 + 32 + 4 + 36*(h.Epoch-1)
	if swap.Keyring != nil && len(*swap.Keyring) > limit {
		return adapters.StoredSwap{}, enverrors.New(enverrors.InvalidData, "Keyring exceeds epoch history size")
	}
	state := []adapters.StateWrite{}
	for _, write := range []struct {
		kind  adapters.StateKind
		key   []byte
		value *[]byte
	}{{adapters.StateKeyring, h.KeyringHash, swap.Keyring}, {adapters.StateEnvelope, []byte{}, swap.Envelope}, {adapters.StateSKPub, []byte{}, swap.SkPub}, {adapters.StateOpaqueRecord, []byte{}, swap.OpaqueRecord}} {
		if write.value != nil {
			state = append(state, adapters.StateWrite{Kind: write.kind, Key: write.key, Bytes: *write.value})
		}
	}
	objectHash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, swap.Header, "manifest")
	if err != nil {
		return adapters.StoredSwap{}, err
	}

	result := adapters.StoredSwap{Header: adapters.StoredHeader{StoredObject: adapters.StoredObject{Hash: objectHash, Bytes: encoding.SignedCodec(manifests.ManifestHeaderCodec).Write(swap.Header)}, Seq: h.Seq}, Entries: []adapters.StoredHeader{}, FilesHash: h.FilesHash, BodyDigest: digest, State: state}
	for _, entry := range swap.Entries {
		objectHashResult, err := crypto.ObjectHash(codecs.EntryCodec, entry, "entry")
		if err != nil {
			return adapters.StoredSwap{}, err
		}

		result.Entries = append(result.Entries, adapters.StoredHeader{StoredObject: adapters.StoredObject{Hash: objectHashResult, Bytes: encoding.SignedCodec(codecs.EntryCodec).Write(entry)}, Seq: entry.Body.Seq})
	}
	if swap.Files != nil {
		data := manifests.FilesCodec.Write(*swap.Files)
		result.Files = &adapters.StoredFiles{StoredObject: adapters.StoredObject{Hash: crypto.H("files", data), Bytes: data}, RetainForever: h.Op == 11, Versions: Versions(swap.Files.Entries)}
	}

	return result, nil
}

func zero(data []byte) bool {
	for _, n := range data {
		if n != 0 {
			return false
		}
	}

	return true
}
