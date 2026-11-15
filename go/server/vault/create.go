package vault

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
)

func ValidCreationMaterial(swap manifests.Swap) bool {
	h := swap.Header.Body

	return swap.Files != nil &&
		len(swap.Files.Entries) == 0 &&
		bytes.Equal(crypto.H("files", manifests.FilesCodec.Write(*swap.Files)), h.FilesHash) &&
		swap.Keyring != nil &&
		bytes.Equal(crypto.H("keyring-blob", *swap.Keyring), h.KeyringHash) &&
		swap.Envelope != nil &&
		bytes.Equal(crypto.H("envelope-blob", *swap.Envelope), h.EnvelopeHash) &&
		swap.SkPub != nil &&
		swap.OpaqueRecord != nil &&
		swap.Approver == nil
}

func ValidateCreation(swap manifests.Swap, id, device, pub []byte) error {
	chain, err := devicechain.VerifyChain(swap.Entries)
	if err != nil {
		return err
	}

	h := swap.Header.Body
	valid := chain.Kind == "valid" && len(swap.Entries) == 2
	if valid {
		var member members.DeviceRecord
		ok := false
		for _, key := range chain.State.DeviceOrder {
			record, exists := chain.State.Devices[key]
			if exists {
				member = record
				ok = true
				break
			}
		}
		validHeader := ok &&
			bytes.Equal(member.Id, device) &&
			bytes.Equal(chain.State.VaultId, id)
		if validHeader {
			serverPin, err := keys.ServerPin(pub)
			if err != nil {
				return err
			}
			validHeader = bytes.Equal(chain.State.ServerPin, serverPin)
		}
		validCreation := validHeader &&
			bytes.Equal(h.VaultId, id) &&
			h.Seq == 1 &&
			h.Op == 0 &&
			h.Epoch == 1 &&
			h.ListSeq == 1 &&
			bytes.Equal(h.ListHead, chain.State.Head) &&
			zero(h.Prev) &&
			zero(swap.ExpectedHead) &&
			bytes.Equal(h.Signer, device)
		if validCreation {
			verifyObject, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, swap.Header, member.ObjPub, "manifest")
			if err != nil {
				return err
			}
			validCreation = verifyObject.OK
		}

		valid = validCreation &&
			ValidCreationMaterial(swap)
	}
	if !valid {
		return enverrors.New(enverrors.InvalidData, "Invalid creation")
	}

	return nil
}

func Create(o shared.Options, auth *shared.Auth, swap manifests.Swap, digest []byte) (adapters.CommitResult, error) {
	return shared.Transaction(o.Storage, func() (adapters.CommitResult, error) {
		r := auth.Request
		id := r.VaultId
		stored, err := StoredSwap(swap, digest)
		if err != nil {
			return adapters.CommitResult{}, err
		}

		hasVault, err := o.Storage.HasVault(id)
		if err != nil {
			return adapters.CommitResult{}, err
		}
		if hasVault {
			findCommitted, err := o.Storage.FindCommitted(id, digest)
			if err != nil {
				return adapters.CommitResult{}, err
			}
			if findCommitted {
				return adapters.CommitResult{Kind: adapters.RetryOfCommitted}, nil
			}

			return adapters.CommitResult{}, enverrors.New(enverrors.Conflict, "Vault already exists")
		}
		hasProof, err := authn.HasProof(o, auth, "setup")
		if err != nil {
			return adapters.CommitResult{}, err
		}
		if !hasProof {
			return adapters.CommitResult{}, enverrors.New(enverrors.Unauthorized, "Setup proof required")
		}
		if err := ValidateCreation(swap, id, r.Device, o.ServerKeys.PublicKey); err != nil {
			return adapters.CommitResult{}, err
		}
		key, err := authn.RequireStagedRecord(o, id, r.Device, *swap.OpaqueRecord)
		if err != nil {
			return adapters.CommitResult{}, err
		}

		authorityKey := adapters.SessionKey{Kind: adapters.SessionLogin, Device: r.Device, Purpose: "registration-authority"}
		authority, err := o.Storage.Session(id, authorityKey, o.Now())
		if err != nil {
			return adapters.CommitResult{}, err
		}

		authorityMismatch := authority == nil
		if !authorityMismatch {
			setupToken, err := o.Storage.SetupToken()
			if err != nil {
				return adapters.CommitResult{}, err
			}
			authorityMismatch = !bytes.Equal(authority, setupToken)
		}
		if authorityMismatch {
			return adapters.CommitResult{}, enverrors.New(enverrors.Unauthorized, "Registration token mismatch")
		}
		stored.ConsumeSessions = []adapters.SessionKey{key, authorityKey}
		setupTokenResult, err := o.Storage.SetupToken()
		if err != nil {
			return adapters.CommitResult{}, err
		}

		stored.SetupTokenHash = setupTokenResult

		period := int64(2592000000)
		stored.Vault = &adapters.StoredVault{Active: true, UnlockPeriod: &period}
		stored.Devices = []adapters.StoredDeviceState{{ID: r.Device, State: adapters.StoredDevice{UnlockedUntil: o.Now() + period, FreshUntil: o.Now() + 600000, ClientVersion: r.ClientVersion}}}

		return shared.Transaction(o.Storage, func() (adapters.CommitResult, error) {
			result, err := o.Storage.CommitSwap(id, nil, stored, o.Now())
			if err != nil {
				return adapters.CommitResult{}, err
			}
			if result.Kind == adapters.Committed {
				if err := authn.RefundRegistration(o, id, r.Device); err != nil {
					return adapters.CommitResult{}, err
				}
			}

			return result, nil
		})
	})
}
