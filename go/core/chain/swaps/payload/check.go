package payload

import (
	manifestchain "github.com/notsuhas/envden/go/core/chain/manifests"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/chain/swaps/context"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func CheckPayload(swap manifests.Swap, context context.Context) (bool, error) {
	return chainshared.TryResult(func() (bool, error) {
		h := swap.Header.Body
		previous := context.Previous.Body
		op := h.Op
		if len(swap.Entries) > 0 && swap.Entries[0].Body.Kind == 6 {
			done := swap.Entries[0].Body.Payload.(entrypayloads.RepairDone)
			if err := chainshared.Check(encoding.Equal(done.RestoredHead, swap.ExpectedHead) || context.AncestorHeaderHashes[chainshared.ID(done.RestoredHead)]); err != nil {
				return false, err
			}
		}
		if err := chainshared.Check((swap.Files != nil) == (op == 1 || op == 11)); err != nil {
			return false, err
		}
		if err := chainshared.Check((swap.Keyring != nil) == (op == 4 || op == 5 || op == 6 || op == 7 || op == 9)); err != nil {
			return false, err
		}
		if err := chainshared.Check((swap.Envelope != nil) == (op == 5 || op == 7 || op == 8 || op == 9)); err != nil {
			return false, err
		}
		if err := chainshared.Check((swap.SkPub != nil) == (op == 5 || op == 7)); err != nil {
			return false, err
		}
		if err := chainshared.Check((swap.OpaqueRecord != nil) == (op == 8 || op == 9 || (op == 12 && context.RepairRegistrationRequired))); err != nil {
			return false, err
		}
		if err := chainshared.Check((swap.Approver != nil) == (op == 2)); err != nil {
			return false, err
		}
		if swap.SkPub != nil {
			if err := keys.ValidateEdPublic(*swap.SkPub); err != nil {
				return false, err
			}
		}
		if swap.OpaqueRecord != nil {
			if err := chainshared.Check(len(*swap.OpaqueRecord) == 192); err != nil {
				return false, err
			}
		}
		if swap.Approver != nil {
			if err := chainshared.Check(len(*swap.Approver) <= 4096); err != nil {
				return false, err
			}
		}
		if swap.Keyring != nil {
			if err := chainshared.Check(encoding.Equal(crypto.H("keyring-blob", *swap.Keyring), h.KeyringHash)); err != nil {
				return false, err
			}
		}
		if swap.Envelope != nil {
			if err := chainshared.Check(encoding.Equal(crypto.H("envelope-blob", *swap.Envelope), h.EnvelopeHash)); err != nil {
				return false, err
			}
		}
		if swap.Files != nil {
			_, err := manifestchain.CheckedFiles(&context.Files, previous.FilesHash)
			if err != nil {
				return false, err
			}

			next, err := manifestchain.CheckedFiles(swap.Files, h.FilesHash)
			if err != nil {
				return false, err
			}

			changed, err := manifestchain.ChangedFiles(context.Files, next, previous.Epoch, h.Epoch, op)
			if err != nil {
				return false, err
			}
			if op == 11 {
				old := map[string]manifests.FileEntry{}
				for _, e := range context.Files.Entries {
					old[chainshared.ID(e.FileId)] = e
				}
				for _, e := range changed {
					if err := chainshared.Check(context.MissingBlobs[chainshared.ID(old[chainshared.ID(e.FileId)].BlobHash)]); err != nil {
						return false, err
					}
				}
			}
		}

		return true, nil
	})
}
