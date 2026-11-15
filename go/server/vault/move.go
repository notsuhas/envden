package vault

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func OpenMove(o shared.Options, auth *shared.Auth) (wire.KindResponse, error) {
	r := auth.Request
	if zero(r.VaultId) {
		return wire.KindResponse{}, enverrors.New(enverrors.InvalidInput, "Invalid vault ID")
	}
	existing, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return wire.KindResponse{}, err
	}

	owner, err := o.Storage.State(r.VaultId, adapters.StateMoveSession, []byte{})
	if err != nil {
		return wire.KindResponse{}, err
	}
	if existing != nil && !existing.Active && owner != nil && bytes.Equal(owner, r.Device) {
		return wire.KindResponse{Kind: "moving"}, nil
	}
	hasProof, err := authn.HasProof(o, auth, "setup")
	if err != nil {
		return wire.KindResponse{}, err
	}
	if !hasProof {
		return wire.KindResponse{}, enverrors.New(enverrors.Unauthorized, "Setup proof required")
	}
	_, err = shared.Transaction(o.Storage, func() (bool, error) {
		period := int64(2592000000)
		setupToken, err := o.Storage.SetupToken()
		if err != nil {
			return false, err
		}
		if err := o.Storage.ConfigureVault(r.VaultId, adapters.StoredVault{UnlockPeriod: &period}, []adapters.StateWrite{{Kind: adapters.StateMoveSession, Key: []byte{}, Bytes: r.Device}}, setupToken); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return wire.KindResponse{}, err
	}

	return wire.KindResponse{Kind: "moving"}, nil
}

func Freeze(o shared.Options, auth *shared.Auth, frozen bool) (wire.KindResponse, error) {
	if err := authn.RequireGate(o, auth, "fresh"); err != nil {
		return wire.KindResponse{}, err
	}

	r := auth.Request
	vault, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return wire.KindResponse{}, err
	}
	if frozen && vault.SKRefused {
		return wire.KindResponse{}, enverrors.New(enverrors.RecoveryKitRequired, "Replace recovery kit before moving")
	}
	if vault.ServerMoved != nil {
		return wire.KindResponse{}, enverrors.New(enverrors.Moving, "Move committed")
	}
	vault.Frozen = frozen
	var owner []byte
	if frozen {
		owner = r.Device
	}
	if err := o.Storage.ConfigureVault(r.VaultId, *vault, []adapters.StateWrite{{Kind: adapters.StateMoveSession, Key: []byte{}, Bytes: owner}}, nil); err != nil {
		return wire.KindResponse{}, err
	}

	kind := "unfrozen"
	if frozen {
		kind = "frozen"
	}

	return wire.KindResponse{Kind: kind}, nil
}

func DiscardMove(o shared.Options, auth *shared.Auth) (wire.KindResponse, error) {
	if err := authn.RequireMove(o, auth); err != nil {
		return wire.KindResponse{}, err
	}
	_, err := shared.Transaction(o.Storage, func() (bool, error) {
		if err := o.Storage.DiscardInactiveVault(auth.Request.VaultId); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return wire.KindResponse{}, err
	}

	return wire.KindResponse{Kind: "unfrozen"}, nil
}

func RequireMoveMaterial(o shared.Options, id []byte) error {
	chain1, chain2, err := vaultchain.Chain(o, id)
	if err != nil {
		return err
	}

	header, _ := chain1, chain2
	h := header.Body
	keyring, err := o.Storage.State(id, adapters.StateKeyring, h.KeyringHash)
	if err != nil {
		return err
	}

	envelope, err := o.Storage.State(id, adapters.StateEnvelope, []byte{})
	if err != nil {
		return err
	}

	sk, err := o.Storage.State(id, adapters.StateSKPub, []byte{})
	if err != nil {
		return err
	}

	files, err := o.Storage.FileList(id, h.FilesHash)
	if err != nil {
		return err
	}

	for _, pair := range []struct {
		hash, data []byte
		domain     string
	}{{h.KeyringHash, keyring, "keyring-blob"}, {h.EnvelopeHash, envelope, "envelope-blob"}, {h.FilesHash, files, "files"}} {
		if pair.data == nil || !bytes.Equal(crypto.H(pair.domain, pair.data), pair.hash) {
			return enverrors.New(enverrors.InvalidData, "Incomplete move material")
		}
	}
	if len(sk) != 32 {
		return enverrors.New(enverrors.InvalidData, "Incomplete move material")
	}
	if files == nil {
		return enverrors.New(enverrors.InvalidData, "Missing head file list")
	}
	blobHashes, err := o.Storage.BlobHashes(id)
	if err != nil {
		return err
	}

	for _, hash := range blobHashes {
		data, err := o.Storage.GetBlob(id, hash)
		if err != nil {
			return err
		}
		if data == nil || !bytes.Equal(crypto.H("blob", data), hash) {
			return enverrors.New(enverrors.InvalidData, "Invalid imported blob")
		}
	}
	filesResult, err := encoding.Decode(manifests.FilesCodec, files)
	if err != nil {
		return err
	}

	for _, file := range filesResult.Entries {
		requiresBlob := (file.State == 1 || file.State == 3)
		if requiresBlob {
			hasBlob, err := o.Storage.HasBlob(id, file.BlobHash)
			if err != nil {
				return err
			}
			requiresBlob = !hasBlob
		}
		if requiresBlob {
			return enverrors.New(enverrors.InvalidData, "Missing imported blob")
		}
	}

	return nil
}
