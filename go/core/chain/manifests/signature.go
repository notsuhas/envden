package manifests

import (
	"slices"

	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func CheckHeaderSignature(source Source, verified *devicechain.State, signed encoding.Signed[manifests.ManifestHeader]) error {
	tryResult, err := chainshared.TryResult(func() (bool, error) {
		h := signed.Body
		if err := chainshared.Check(encoding.Equal(h.VaultId, verified.VaultId)); err != nil {
			return false, err
		}

		state := verified
		if h.ListSeq >= state.Seq {
			tryResultResult, err := chainshared.TryResult(func() (*devicechain.State, error) {
				entryDescent, err := EntryDescent(source, state, h)
				if err != nil {
					return nil, err
				}

				return applyEntries(state, entryDescent)
			})
			next := tryResultResult
			if chainshared.Invalid(err) {
				stateFromGenesisResult, err := stateFromGenesis(source, h)
				if err != nil {
					return false, err
				}

				state = stateFromGenesisResult
			} else {
				if err := err; err != nil {
					return false, err
				}

				state = next
			}
		} else {
			stateFromGenesisResult2, err := stateFromGenesis(source, h)
			if err != nil {
				return false, err
			}

			state = stateFromGenesisResult2
		}
		if err := chainshared.Check(encoding.Equal(state.VaultId, h.VaultId) && encoding.Equal(state.Head, h.ListHead)); err != nil {
			return false, err
		}

		signer, ok := state.Devices[chainshared.ID(h.Signer)]
		validSigner := ok
		if validSigner {
			verifyObject, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, signed, signer.ObjPub, "manifest")
			if err != nil {
				return false, err
			}
			validSigner = verifyObject.OK
		}
		if err := chainshared.Check(validSigner); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return err
	}

	_ = tryResult

	return err
}

func applyEntries(state *devicechain.State, entries []encoding.Signed[codecs.Entry]) (*devicechain.State, error) {
	for _, entry := range entries {
		r, err := devicechain.ApplyEntry(state, entry)
		if err != nil {
			return nil, err
		}
		if err := chainshared.Check(r.Kind == "valid"); err != nil {
			return nil, err
		}

		state = r.State
	}

	return state, nil
}

func stateFromGenesis(source Source, h manifests.ManifestHeader) (*devicechain.State, error) {
	return chainshared.TryResult(func() (*devicechain.State, error) {
		entries := []encoding.Signed[codecs.Entry]{}
		hash := h.ListHead
		for seq := h.ListSeq; ; seq-- {
			entry, err := source.Entry(hash)
			if err != nil {
				return nil, err
			}
			if err := chainshared.Check(entry != nil && entry.Body.Seq == seq); err != nil {
				return nil, err
			}

			entries = append(entries, *entry)
			hash = entry.Body.Parent
			if seq == 0 {
				break
			}
		}
		slices.Reverse(entries)
		r, err := devicechain.VerifyChain(entries)
		if err != nil {
			return nil, err
		}
		if err := chainshared.Check(r.Kind == "valid"); err != nil {
			return nil, err
		}

		return r.State, nil
	})
}
