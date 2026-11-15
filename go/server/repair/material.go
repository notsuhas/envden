package repair

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	x "github.com/notsuhas/envden/go/server/shared"
	vault "github.com/notsuhas/envden/go/server/vault"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func StoreMaterial(o x.Options, auth *x.Auth, kind string, hash, data []byte) s.KindResponse {
	return x.Transaction(o.Storage, func() s.KindResponse {
		id := auth.Request.VaultId
		metadata := x.Must(o.Storage.Vault(id))
		if metadata.Restored != nil {
			if v.Membership(o, id, auth.Request.Device) == nil {
				x.Fail(e.NotMember, "Membership required")
			}
			if kind == "skPub" {
				x.Fail(e.InvalidInput, "Invalid repair material")
			}
		}
		if kind == "files" {
			return restoreFiles(o, id, hash, data)
		}
		if len(data) > 16777216 || kind != "keyring" && kind != "envelope" && kind != "skPub" {
			x.Fail(e.InvalidInput, "Invalid material")
		}
		domain := "keyring-blob"
		if kind == "envelope" {
			domain = "envelope-blob"
		}
		if kind == "skPub" && len(data) != 32 || kind != "skPub" && !bytes.Equal(cr.H(domain, data), hash) {
			x.Fail(e.InvalidData, "Material hash mismatch")
		}
		if kind != "skPub" && !referenced(o, id, kind, hash) {
			x.Fail(e.InvalidData, "Unreferenced material")
		}
		key := []byte{}
		stateKind := a.StateSKPub
		if kind == "keyring" {
			key = hash
			stateKind = a.StateKeyring
		} else if kind == "envelope" {
			stateKind = a.StateEnvelope
		}
		x.Check(o.Storage.WriteState(id, []a.StateWrite{{Kind: stateKind, Key: key, Bytes: data}}))
		return s.KindResponse{Kind: "uploaded"}
	})
}
func referenced(o x.Options, id []byte, kind string, hash []byte) bool {
	if kind == "envelope" {
		head := x.Must(o.Storage.Head(id))
		if head == nil {
			return false
		}
		row := x.Must(o.Storage.Header(id, head))
		return row != nil && bytes.Equal(header(row.Bytes).EnvelopeHash, hash)
	}
	for _, row := range x.Must(o.Storage.Headers(id, 1, ^uint64(0), 0, 0)) {
		if bytes.Equal(header(row.Bytes).KeyringHash, hash) {
			return true
		}
	}
	return false
}
func header(data []byte) m.ManifestHeader {
	return x.Must(b.Decode(b.SignedCodec(m.ManifestHeaderCodec), data)).Body
}
func restoreFiles(o x.Options, id, hash, data []byte) s.KindResponse {
	files := x.Input(func() m.Files { return x.Must(b.Decode(m.FilesCodec, data)) })
	if !bytes.Equal(cr.H("files", data), hash) {
		x.Fail(e.InvalidData, "Files hash mismatch")
	}
	rows := x.Must(o.Storage.HeadersForFiles(id, hash))
	headers := []m.ManifestHeader{}
	found := false
	permanent := false
	for _, row := range rows {
		h := header(row.Bytes)
		headers = append(headers, h)
		if bytes.Equal(h.FilesHash, hash) {
			found = true
		}
	}
	if !found {
		x.Fail(e.InvalidData, "Unreferenced files")
	}
	for i, h := range headers {
		if h.Op == 11 && (bytes.Equal(h.FilesHash, hash) || i > 0 && bytes.Equal(headers[i-1].FilesHash, hash)) {
			permanent = true
		}
	}
	x.Check(o.Storage.PutFileList(id, a.StoredFiles{StoredObject: a.StoredObject{Hash: hash, Bytes: data}, RetainForever: permanent, Versions: vault.Versions(files.Entries)}, o.Now()))
	return s.KindResponse{Kind: "uploaded"}
}
