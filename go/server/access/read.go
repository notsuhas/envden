package access

import (
	"bytes"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
)

func RequireRead(o x.Options, auth *x.Auth, kind string, hash []byte) {
	id := auth.Request.VaultId
	vault := x.Must(o.Storage.Vault(id))
	if vault.Restored != nil {
		authn.RequireRepair(o, auth)
		if !auth.Member {
			x.Fail(e.NotMember, "Membership required")
		}
		return
	}
	if !vault.Active {
		x.Fail(e.Moving, "Vault moving")
	}
	if !auth.Member || authn.HasProof(o, auth, "sk") {
		if !auth.Member {
			authn.RequireJoinTicket(o, auth)
		}
		if kind == "blob" {
			x.Fail(e.Unauthorized, "Blob read requires unlock")
		}
		if kind == "files" || kind == "keyring" {
			head := x.Must(o.Storage.Head(id))
			row := x.Must(o.Storage.Header(id, head))
			header := x.Must(b.Decode(b.SignedCodec(m.ManifestHeaderCodec), row.Bytes)).Body
			expected := header.FilesHash
			if kind == "keyring" {
				expected = header.KeyringHash
			}
			if hash == nil || !bytes.Equal(hash, expected) {
				x.Fail(e.Unauthorized, "Head files only")
			}
		}
		return
	}
	gate := "unlocked"
	if kind == "envelope" {
		gate = "fresh"
	}
	authn.RequireGate(o, auth, gate)
}
