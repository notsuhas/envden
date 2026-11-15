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

func headerHash(h encoding.Signed[manifests.ManifestHeader]) ([]byte, error) {
	return crypto.ObjectHash(manifests.ManifestHeaderCodec, h, "manifest")
}

func HeaderDescent(source Source, ancestor, head encoding.Signed[manifests.ManifestHeader], verifyDivergent func(encoding.Signed[manifests.ManifestHeader]) error) ([]encoding.Signed[manifests.ManifestHeader], error) {
	return chainshared.TryResult(func() ([]encoding.Signed[manifests.ManifestHeader], error) {
		path := []encoding.Signed[manifests.ManifestHeader]{}
		current := head
		for current.Body.Seq > ancestor.Body.Seq {
			path = append(path, current)
			previous, err := source.Header(current.Body.Prev)
			if err != nil {
				return nil, err
			}

			validParent := previous != nil
			if validParent {
				headerHashResult, err := headerHash(*previous)
				if err != nil {
					return nil, err
				}
				validParent = encoding.Equal(headerHashResult, current.Body.Prev)
			}
			if err := chainshared.Check(validParent); err != nil {
				return nil, err
			}
			if err := chainshared.Check(previous.Body.Seq+1 == current.Body.Seq && previous.Body.Seq != ^uint64(0)); err != nil {
				return nil, err
			}

			current = *previous
		}
		headerHashResult2, err := headerHash(current)
		if err != nil {
			return nil, err
		}
		headerHashResult3, err := headerHash(ancestor)
		if err != nil {
			return nil, err
		}
		if !encoding.Equal(headerHashResult2, headerHashResult3) {
			if err := verifyDivergent(current); err != nil {
				return nil, err
			}

			for _, h := range path {
				if err := verifyDivergent(h); err != nil {
					return nil, err
				}
				_ = true
			}

			return nil, nil
		}
		slices.Reverse(path)

		return path, nil
	})
}

func EntryDescent(source Source, ancestor *devicechain.State, target manifests.ManifestHeader) ([]encoding.Signed[codecs.Entry], error) {
	return chainshared.TryResult(func() ([]encoding.Signed[codecs.Entry], error) {
		path := []encoding.Signed[codecs.Entry]{}
		hash := target.ListHead
		seq := target.ListSeq
		if err := chainshared.Check(seq >= ancestor.Seq); err != nil {
			return nil, err
		}

		for seq > ancestor.Seq {
			entry, err := source.Entry(hash)
			if err != nil {
				return nil, err
			}

			validEntry := entry != nil && entry.Body.Seq == seq
			if validEntry {
				objectHash, err := crypto.ObjectHash(codecs.EntryCodec, *entry, "entry")
				if err != nil {
					return nil, err
				}
				validEntry = encoding.Equal(objectHash, hash)
			}
			if err := chainshared.Check(validEntry); err != nil {
				return nil, err
			}

			path = append(path, *entry)
			hash = entry.Body.Parent
			seq--
		}
		if err := chainshared.Check(encoding.Equal(hash, ancestor.Head)); err != nil {
			return nil, err
		}

		slices.Reverse(path)

		return path, nil
	})
}
