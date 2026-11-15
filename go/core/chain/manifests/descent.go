package manifests

import (
	"slices"

	d "github.com/notsuhas/envden/go/core/chain/devices"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func headerHash(h b.Signed[m.ManifestHeader]) []byte {

	return b.Must(cr.ObjectHash(m.ManifestHeaderCodec, h, "manifest"))
}

func HeaderDescent(source Source, ancestor, head b.Signed[m.ManifestHeader], verifyDivergent func(b.Signed[m.ManifestHeader]) error) ([]b.Signed[m.ManifestHeader], error) {

	return s.Try(func() []b.Signed[m.ManifestHeader] {
		path := []b.Signed[m.ManifestHeader]{}
		current := head
		for current.Body.Seq > ancestor.Body.Seq {
			path = append(path, current)
			previous := b.Must(source.Header(current.Body.Prev))
			s.Check(previous != nil && b.Equal(headerHash(*previous), current.Body.Prev))
			s.Check(previous.Body.Seq+1 == current.Body.Seq && previous.Body.Seq != ^uint64(0))
			current = *previous
		}
		if !b.Equal(headerHash(current), headerHash(ancestor)) {
			b.Must(true, verifyDivergent(current))
			for _, h := range path {
				b.Must(true, verifyDivergent(h))
			}
			return nil
		}
		slices.Reverse(path)
		return path
	})
}

func EntryDescent(source Source, ancestor *d.State, target m.ManifestHeader) ([]b.Signed[c.Entry], error) {

	return s.Try(func() []b.Signed[c.Entry] {
		path := []b.Signed[c.Entry]{}
		hash := target.ListHead
		seq := target.ListSeq
		s.Check(seq >= ancestor.Seq)
		for seq > ancestor.Seq {
			entry := b.Must(source.Entry(hash))
			s.Check(entry != nil && entry.Body.Seq == seq && b.Equal(b.Must(cr.ObjectHash(c.EntryCodec, *entry, "entry")), hash))
			path = append(path, *entry)
			hash = entry.Body.Parent
			seq--
		}
		s.Check(b.Equal(hash, ancestor.Head))
		slices.Reverse(path)
		return path
	})
}
