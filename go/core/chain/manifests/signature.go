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

func CheckHeaderSignature(source Source, verified *d.State, signed b.Signed[m.ManifestHeader]) error {
	_, err := s.Try(func() bool {
		h := signed.Body
		s.Check(b.Equal(h.VaultId, verified.VaultId))
		state := verified
		if h.ListSeq >= state.Seq {
			next, err := s.Try(func() *d.State { return applyEntries(state, b.Must(EntryDescent(source, state, h))) })
			if s.Invalid(err) {
				state = b.Must(stateFromGenesis(source, h))
			} else {
				state = b.Must(next, err)
			}
		} else {
			state = b.Must(stateFromGenesis(source, h))
		}
		s.Check(b.Equal(state.VaultId, h.VaultId) && b.Equal(state.Head, h.ListHead))
		signer, ok := state.Devices[s.ID(h.Signer)]
		s.Check(ok && b.Must(cr.VerifyObject(m.ManifestHeaderCodec, signed, signer.ObjPub, "manifest")).OK)
		return true
	})

	return err
}

func applyEntries(state *d.State, entries []b.Signed[c.Entry]) *d.State {
	for _, entry := range entries {
		r := b.Must(d.ApplyEntry(state, entry))
		s.Check(r.Kind == "valid")
		state = r.State
	}

	return state
}

func stateFromGenesis(source Source, h m.ManifestHeader) (*d.State, error) {

	return s.Try(func() *d.State {
		entries := []b.Signed[c.Entry]{}
		hash := h.ListHead
		for seq := h.ListSeq; ; seq-- {
			entry := b.Must(source.Entry(hash))
			s.Check(entry != nil && entry.Body.Seq == seq)
			entries = append(entries, *entry)
			hash = entry.Body.Parent
			if seq == 0 {
				break
			}
		}
		slices.Reverse(entries)
		r := b.Must(d.VerifyChain(entries))
		s.Check(r.Kind == "valid")
		return r.State
	})
}
