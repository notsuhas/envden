package swaps

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/chain/swaps/context"
	"github.com/notsuhas/envden/go/core/chain/swaps/payload"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Context = context.Context

type Result struct {
	Kind          string
	Authorization Authorization
	State         *d.State
}

func ValidateSwap(swap m.Swap, context Context) (Result, error) {
	result, err := s.Try(func() Result {
		m.SwapCodec.Write(swap)
		h := swap.Header.Body
		previous := context.Previous.Body
		s.Check(b.Equal(swap.ExpectedHead, b.Must(cr.ObjectHash(m.ManifestHeaderCodec, context.Previous, "manifest"))))
		s.Check(b.Equal(h.Prev, swap.ExpectedHead) && h.Seq == previous.Seq+1 && previous.Seq != ^uint64(0))
		s.Check(b.Equal(h.VaultId, context.State.VaultId))
		s.Check(previous.ListSeq == context.State.Seq && b.Equal(previous.ListHead, context.State.Head))
		state := context.State
		for _, entry := range swap.Entries {
			r := b.Must(d.ApplyEntry(state, entry))
			s.Check(r.Kind == "valid")
			state = r.State
		}
		auth := b.Must(OperationRequirement(previous, h, swap.Entries, context.State, context.DestinationPin != nil))
		s.Check(h.ListSeq == state.Seq && b.Equal(h.ListHead, state.Head) && h.Epoch == state.Epoch)
		member, ok := state.Devices[s.ID(h.Signer)]
		s.Check(ok && b.Must(cr.VerifyObject(m.ManifestHeaderCodec, swap.Header, member.ObjPub, "manifest")).OK)
		_, requestMember := state.Devices[s.ID(context.RequestSigner)]
		s.Check(b.Equal(context.RequestSigner, h.Signer) || (h.Op == 10 && context.DestinationPin != nil && requestMember))
		if h.Op == 10 && context.DestinationPin != nil {
			checkDestination(swap, context.DestinationPin)
		}
		b.Must(payload.CheckPayload(swap, context))
		return Result{Kind: "valid", Authorization: auth, State: state}
	})
	if s.Invalid(err) {
		return Result{Kind: "invalid"}, nil
	}

	return result, err
}

func checkDestination(swap m.Swap, pin []byte) {
	s.Check(len(swap.Entries) > 0 && swap.Entries[0].Body.Kind == 5)
	s.Check(b.Equal(swap.Entries[0].Body.Payload.(p.ServerMoved).NewPin, pin))
}
