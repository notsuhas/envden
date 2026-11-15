package access

import (
	"bytes"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
)

func RequireRead(o shared.Options, auth *shared.Auth, kind string, hash []byte) error {
	id := auth.Request.VaultId
	vault, err := o.Storage.Vault(id)
	if err != nil {
		return err
	}
	if vault.Restored != nil {
		if err := authn.RequireRepair(o, auth); err != nil {
			return err
		}
		if !auth.Member {
			return enverrors.New(enverrors.NotMember, "Membership required")
		}

		return nil
	}
	if !vault.Active {
		return enverrors.New(enverrors.Moving, "Vault moving")
	}
	requiresProof := !auth.Member
	if !requiresProof {
		hasProof, err := authn.HasProof(o, auth, "sk")
		if err != nil {
			return err
		}
		requiresProof = hasProof
	}
	if requiresProof {
		if !auth.Member {
			if err := authn.RequireJoinTicket(o, auth); err != nil {
				return err
			}
		}
		if kind == "blob" {
			return enverrors.New(enverrors.Unauthorized, "Blob read requires unlock")
		}
		if kind == "files" || kind == "keyring" {
			head, err := o.Storage.Head(id)
			if err != nil {
				return err
			}

			row, err := o.Storage.Header(id, head)
			if err != nil {
				return err
			}

			decoded, err := encoding.Decode(encoding.SignedCodec(manifests.ManifestHeaderCodec), row.Bytes)
			if err != nil {
				return err
			}

			header := decoded.Body
			expected := header.FilesHash
			if kind == "keyring" {
				expected = header.KeyringHash
			}
			if hash == nil || !bytes.Equal(hash, expected) {
				return enverrors.New(enverrors.Unauthorized, "Head files only")
			}
		}

		return nil
	}
	gate := "unlocked"
	if kind == "envelope" {
		gate = "fresh"
	}

	return authn.RequireGate(o, auth, gate)
}
