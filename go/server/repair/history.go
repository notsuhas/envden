package repair

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vault"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func UploadHistory(o shared.Options, auth *shared.Auth, swap manifests.Swap, digest []byte, checkUploader bool) (adapters.CommitResult, error) {
	id := auth.Request.VaultId
	stored, err := vault.StoredSwap(swap, digest)
	if err != nil {
		return adapters.CommitResult{}, err
	}

	metadata, err := o.Storage.Vault(id)
	if err != nil {
		return adapters.CommitResult{}, err
	}

	writes := []adapters.StateWrite{}
	for _, write := range stored.State {
		if write.Kind != adapters.StateOpaqueRecord && (metadata.Restored == nil || write.Kind != adapters.StateSKPub) {
			writes = append(writes, write)
		}
	}
	stored.State = writes
	head, err := o.Storage.Head(id)
	if err != nil {
		return adapters.CommitResult{}, err
	}

	hasPriorHead := head != nil
	if hasPriorHead {
		findCommitted, err := o.Storage.FindCommitted(id, digest)
		if err != nil {
			return adapters.CommitResult{}, err
		}
		hasPriorHead = findCommitted
	}
	if hasPriorHead {
		return adapters.CommitResult{Kind: adapters.RetryOfCommitted}, nil
	}
	if head == nil {
		if err := verifyGenesis(o, auth, swap, checkUploader); err != nil {
			return adapters.CommitResult{}, err
		}

		return o.Storage.CommitSwap(id, nil, stored, o.Now())
	}
	if err := verifyHistory(o, auth, swap, checkUploader); err != nil {
		return adapters.CommitResult{}, err
	}

	return o.Storage.CommitSwap(id, swap.ExpectedHead, stored, o.Now())
}

func verifyHistory(o shared.Options, auth *shared.Auth, swap manifests.Swap, check bool) error {
	id := auth.Request.VaultId
	chain1, chain2, err := vaultchain.Chain(o, id)
	if err != nil {
		return err
	}

	previous, before := chain1, chain2
	state := before
	h := swap.Header.Body
	objectHash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, previous, "manifest")
	if err != nil {
		return err
	}
	if !bytes.Equal(swap.ExpectedHead, objectHash) || !bytes.Equal(h.Prev, swap.ExpectedHead) || h.Seq != previous.Body.Seq+1 || !bytes.Equal(h.VaultId, id) {
		return enverrors.New(enverrors.InvalidData, "History linkage mismatch")
	}
	for _, entry := range swap.Entries {
		result, err := devicechain.ApplyEntry(state, entry)
		if err != nil {
			return err
		}
		if result.Kind != "valid" {
			return enverrors.New(enverrors.InvalidData, "Invalid history entry")
		}
		state = result.State
	}
	signer, ok := state.Devices[encoding.Base32(h.Signer)]
	_, uploader := state.Devices[encoding.Base32(auth.Request.Device)]
	invalidSigner := !ok
	if !invalidSigner {
		verifyObject, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, swap.Header, signer.ObjPub, "manifest")
		if err != nil {
			return err
		}
		invalidSigner = !verifyObject.OK
	}
	invalidHeader := invalidSigner ||
		h.ListSeq != state.Seq || !bytes.Equal(h.ListHead, state.Head) || h.Epoch != state.Epoch
	if !invalidHeader {
		requiresUploader := check
		if requiresUploader {
			vault, err := o.Storage.Vault(id)
			if err != nil {
				return err
			}
			requiresUploader = vault.Restored != nil
		}
		invalidHeader = requiresUploader &&
			!uploader
	}
	if invalidHeader {
		return enverrors.New(enverrors.InvalidData, "Invalid history header")
	}

	return transition(o, swap, previous, before, id)
}

func UploadChain(o shared.Options, auth *shared.Auth, swaps []manifests.Swap) (adapters.CommitResult, error) {
	if len(swaps) == 0 {
		return adapters.CommitResult{}, enverrors.New(enverrors.InvalidInput, "Empty history")
	}

	return shared.Transaction(o.Storage, func() (adapters.CommitResult, error) {
		var result adapters.CommitResult
		for _, swap := range swaps {
			uploadHistory, err := UploadHistory(o, auth, swap, crypto.H("swap", manifests.SwapCodec.Write(swap)), false)
			if err != nil {
				return adapters.CommitResult{}, err
			}

			result = uploadHistory
			if result.Kind == adapters.HeadMovedResult {
				return adapters.CommitResult{}, enverrors.New(enverrors.HeadMoved, "History head moved")
			}
		}
		vault, err := o.Storage.Vault(auth.Request.VaultId)
		if err != nil {
			return adapters.CommitResult{}, err
		}
		requiresMembership := vault.Restored != nil
		if requiresMembership {
			membership, err := vaultchain.Membership(o, auth.Request.VaultId, auth.Request.Device)
			if err != nil {
				return adapters.CommitResult{}, err
			}
			requiresMembership = membership == nil
		}
		if requiresMembership {
			return adapters.CommitResult{}, enverrors.New(enverrors.NotMember, "Uploader not a repaired member")
		}

		return result, nil
	})
}
