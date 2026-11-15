package memory

import (
	"bytes"
	"encoding/hex"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
)

func hexDecode(s string) ([]byte, error) { return hex.DecodeString(s) }

func (m *memory) hasBlob(v, h []byte) bool { _, ok := m.data.Blobs[pair(v, h)]; return ok }

func (m *memory) putBlob(v, h, b []byte, verify func([]byte) ([]byte, error), now, quota int64) {
	if verify != nil {
		hash, e := verify(b)
		must(e)
		if !bytes.Equal(hash, h) {
			fail("Blob hash mismatch")
		}
	}
	key := pair(v, h)
	prior, ok := m.data.Blobs[key]
	if ok && !same(prior.Bytes, b) {
		fail("Conflicting blob")
	}
	var used int64
	for _, blob := range m.data.Blobs {
		if blob.Vault == hexKey(v) {
			used += int64(len(blob.Bytes))
		}
	}
	if quota == 0 {
		quota = 1 << 30
	}
	if used-int64(len(prior.Bytes))+int64(len(b)) > quota {
		panic(enverrors.New("STORAGE_QUOTA", "Vault storage quota exceeded"))
	}
	m.data.Blobs[key] = blob{hexKey(v), clone(h), clone(b), now}
	m.ordered("blobs", key)
}

func (m *memory) getBlob(v, h []byte) []byte { return clone(m.data.Blobs[pair(v, h)].Bytes) }

func (m *memory) blobHashes(v []byte) [][]byte {
	out := [][]byte{}
	for _, key := range m.data.Order["blobs"] {
		b, ok := m.data.Blobs[key]
		if ok && b.Vault == hexKey(v) {
			out = append(out, clone(b.Hash))
		}
	}

	return out
}

func (m *memory) vaultUsage(v []byte) int64 {
	var size int64
	key := hexKey(v)
	for _, b := range m.data.Blobs {
		if b.Vault == key {
			size += int64(len(b.Bytes))
		}
	}
	for _, l := range m.data.Lists {
		if l.Vault == key {
			size += int64(len(l.Files.Bytes))
		}
	}
	for _, s := range m.data.States {
		if s.Vault == key && s.Kind == adapters.StateKeyring {
			size += int64(len(s.Bytes))
		}
	}

	return size
}
