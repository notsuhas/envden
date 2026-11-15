package repair

import (
	"bytes"

	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/shared"
)

func verifyGenesis(o shared.Options, auth *shared.Auth, swap manifests.Swap, check bool) error {
	result, err := devicechain.VerifyChain(swap.Entries)
	if err != nil {
		return err
	}

	h := swap.Header.Body
	id := auth.Request.VaultId
	valid := result.Kind == "valid"
	if valid {
		member, ok := result.State.Devices[encoding.Base32(h.Signer)]
		_, uploader := result.State.Devices[encoding.Base32(auth.Request.Device)]
		knownSigner := ok
		if knownSigner {
			uploaderAllowed := !check
			if !uploaderAllowed {
				vault, err := o.Storage.Vault(id)
				if err != nil {
					return err
				}
				uploaderAllowed = vault.Restored == nil
			}
			knownSigner = (uploaderAllowed ||
				uploader)
		}
		validGenesis := knownSigner &&
			bytes.Equal(result.State.VaultId, id) &&
			bytes.Equal(h.VaultId, id) &&
			h.Op == 0 &&
			h.Seq == 1 &&
			h.ListSeq == 1 &&
			bytes.Equal(h.ListHead, result.State.Head) &&
			h.Epoch == 1 &&
			zero(h.Prev) &&
			zero(swap.ExpectedHead) &&
			swap.Files != nil &&
			len(swap.Files.Entries) == 0 &&
			bytes.Equal(crypto.H("files", manifests.FilesCodec.Write(*swap.Files)), h.FilesHash) &&
			(swap.Keyring == nil || bytes.Equal(crypto.H("keyring-blob", *swap.Keyring), h.KeyringHash)) &&
			(swap.Envelope == nil || bytes.Equal(crypto.H("envelope-blob", *swap.Envelope), h.EnvelopeHash))
		if validGenesis {
			verifyObject, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, swap.Header, member.ObjPub, "manifest")
			if err != nil {
				return err
			}
			validGenesis = verifyObject.OK
		}

		valid = validGenesis
	}
	if !valid {
		return enverrors.New(enverrors.InvalidData, "Invalid imported genesis")
	}

	return nil
}

func zero(data []byte) bool {
	for _, n := range data {
		if n != 0 {
			return false
		}
	}

	return true
}
