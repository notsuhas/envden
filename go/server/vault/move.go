package vault

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func OpenMove(o x.Options, auth *x.Auth) s.KindResponse {
	r := auth.Request
	if zero(r.VaultId) {
		x.Fail(e.InvalidInput, "Invalid vault ID")
	}
	existing := x.Must(o.Storage.Vault(r.VaultId))
	owner := x.Must(o.Storage.State(r.VaultId, a.StateMoveSession, []byte{}))
	if existing != nil && !existing.Active && owner != nil && bytes.Equal(owner, r.Device) {
		return s.KindResponse{Kind: "moving"}
	}
	if !authn.HasProof(o, auth, "setup") {
		x.Fail(e.Unauthorized, "Setup proof required")
	}
	x.Transaction(o.Storage, func() bool {
		period := int64(2592000000)
		x.Check(o.Storage.ConfigureVault(r.VaultId, a.StoredVault{UnlockPeriod: &period}, []a.StateWrite{{Kind: a.StateMoveSession, Key: []byte{}, Bytes: r.Device}}, x.Must(o.Storage.SetupToken())))
		return true
	})
	return s.KindResponse{Kind: "moving"}
}
func Freeze(o x.Options, auth *x.Auth, frozen bool) s.KindResponse {
	authn.RequireGate(o, auth, "fresh")
	r := auth.Request
	vault := x.Must(o.Storage.Vault(r.VaultId))
	if frozen && vault.SKRefused {
		x.Fail(e.RecoveryKitRequired, "Replace recovery kit before moving")
	}
	if vault.ServerMoved != nil {
		x.Fail(e.Moving, "Move committed")
	}
	vault.Frozen = frozen
	var owner []byte
	if frozen {
		owner = r.Device
	}
	x.Check(o.Storage.ConfigureVault(r.VaultId, *vault, []a.StateWrite{{Kind: a.StateMoveSession, Key: []byte{}, Bytes: owner}}, nil))
	kind := "unfrozen"
	if frozen {
		kind = "frozen"
	}
	return s.KindResponse{Kind: kind}
}
func DiscardMove(o x.Options, auth *x.Auth) s.KindResponse {
	authn.RequireMove(o, auth)
	x.Transaction(o.Storage, func() bool { x.Check(o.Storage.DiscardInactiveVault(auth.Request.VaultId)); return true })
	return s.KindResponse{Kind: "unfrozen"}
}
func RequireMoveMaterial(o x.Options, id []byte) {
	header, _ := v.Chain(o, id)
	h := header.Body
	keyring := x.Must(o.Storage.State(id, a.StateKeyring, h.KeyringHash))
	envelope := x.Must(o.Storage.State(id, a.StateEnvelope, []byte{}))
	sk := x.Must(o.Storage.State(id, a.StateSKPub, []byte{}))
	files := x.Must(o.Storage.FileList(id, h.FilesHash))
	for _, pair := range []struct {
		hash, data []byte
		domain     string
	}{{h.KeyringHash, keyring, "keyring-blob"}, {h.EnvelopeHash, envelope, "envelope-blob"}, {h.FilesHash, files, "files"}} {
		if pair.data == nil || !bytes.Equal(cr.H(pair.domain, pair.data), pair.hash) {
			x.Fail(e.InvalidData, "Incomplete move material")
		}
	}
	if len(sk) != 32 {
		x.Fail(e.InvalidData, "Incomplete move material")
	}
	if files == nil {
		x.Fail(e.InvalidData, "Missing head file list")
	}
	for _, hash := range x.Must(o.Storage.BlobHashes(id)) {
		data := x.Must(o.Storage.GetBlob(id, hash))
		if data == nil || !bytes.Equal(cr.H("blob", data), hash) {
			x.Fail(e.InvalidData, "Invalid imported blob")
		}
	}
	for _, file := range x.Must(b.Decode(m.FilesCodec, files)).Entries {
		if (file.State == 1 || file.State == 3) && !x.Must(o.Storage.HasBlob(id, file.BlobHash)) {
			x.Fail(e.InvalidData, "Missing imported blob")
		}
	}
}
