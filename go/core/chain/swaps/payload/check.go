package payload

import (
	f "github.com/notsuhas/envden/go/core/chain/manifests"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/chain/swaps/context"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func CheckPayload(swap m.Swap, context context.Context) (bool, error) {

	return s.Try(func() bool {
		h := swap.Header.Body
		previous := context.Previous.Body
		op := h.Op
		if len(swap.Entries) > 0 && swap.Entries[0].Body.Kind == 6 {
			done := swap.Entries[0].Body.Payload.(p.RepairDone)
			s.Check(b.Equal(done.RestoredHead, swap.ExpectedHead) || context.AncestorHeaderHashes[s.ID(done.RestoredHead)])
		}
		s.Check((swap.Files != nil) == (op == 1 || op == 11))
		s.Check((swap.Keyring != nil) == (op == 4 || op == 5 || op == 6 || op == 7 || op == 9))
		s.Check((swap.Envelope != nil) == (op == 5 || op == 7 || op == 8 || op == 9))
		s.Check((swap.SkPub != nil) == (op == 5 || op == 7))
		s.Check((swap.OpaqueRecord != nil) == (op == 8 || op == 9 || (op == 12 && context.RepairRegistrationRequired)))
		s.Check((swap.Approver != nil) == (op == 2))
		if swap.SkPub != nil {
			b.Must(true, keys.ValidateEdPublic(*swap.SkPub))
		}
		if swap.OpaqueRecord != nil {
			s.Check(len(*swap.OpaqueRecord) == 192)
		}
		if swap.Approver != nil {
			s.Check(len(*swap.Approver) <= 4096)
		}
		if swap.Keyring != nil {
			s.Check(b.Equal(cr.H("keyring-blob", *swap.Keyring), h.KeyringHash))
		}
		if swap.Envelope != nil {
			s.Check(b.Equal(cr.H("envelope-blob", *swap.Envelope), h.EnvelopeHash))
		}
		if swap.Files != nil {
			b.Must(f.CheckedFiles(&context.Files, previous.FilesHash))
			next := b.Must(f.CheckedFiles(swap.Files, h.FilesHash))
			changed := b.Must(f.ChangedFiles(context.Files, next, previous.Epoch, h.Epoch, op))
			if op == 11 {
				old := map[string]m.FileEntry{}
				for _, e := range context.Files.Entries {
					old[s.ID(e.FileId)] = e
				}
				for _, e := range changed {
					s.Check(context.MissingBlobs[s.ID(old[s.ID(e.FileId)].BlobHash)])
				}
			}
		}
		return true
	})
}
