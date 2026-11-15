package swaps

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/chain/swaps/context"
	"github.com/notsuhas/envden/go/core/chain/swaps/payload"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Context = context.Context

type Result struct {
	Kind          string
	Authorization Authorization
	State         *devicechain.State
}

func ValidateSwap(swap manifests.Swap, context Context) (Result, error) {
	tryResult, err := chainshared.TryResult(func() (Result, error) {
		manifests.SwapCodec.Write(swap)
		h := swap.Header.Body
		previous := context.Previous.Body
		objectHash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, context.Previous, "manifest")
		if err != nil {
			return *new(Result), err
		}
		if err := chainshared.Check(encoding.Equal(swap.ExpectedHead, objectHash)); err != nil {
			return *new(Result), err
		}
		if err := chainshared.Check(encoding.Equal(h.Prev, swap.ExpectedHead) && h.Seq == previous.Seq+1 && previous.Seq != ^uint64(0)); err != nil {
			return *new(Result), err
		}
		if err := chainshared.Check(encoding.Equal(h.VaultId, context.State.VaultId)); err != nil {
			return *new(Result), err
		}
		if err := chainshared.Check(previous.ListSeq == context.State.Seq && encoding.Equal(previous.ListHead, context.State.Head)); err != nil {
			return *new(Result), err
		}

		state := context.State
		for _, entry := range swap.Entries {
			r, err := devicechain.ApplyEntry(state, entry)
			if err != nil {
				return *new(Result), err
			}
			if err := chainshared.Check(r.Kind == "valid"); err != nil {
				return *new(Result), err
			}

			state = r.State
		}
		auth, err := OperationRequirement(previous, h, swap.Entries, context.State, context.DestinationPin != nil)
		if err != nil {
			return *new(Result), err
		}
		if err := chainshared.Check(h.ListSeq == state.Seq && encoding.Equal(h.ListHead, state.Head) && h.Epoch == state.Epoch); err != nil {
			return *new(Result), err
		}

		member, ok := state.Devices[chainshared.ID(h.Signer)]
		validSignature := ok
		if validSignature {
			verifyObject, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, swap.Header, member.ObjPub, "manifest")
			if err != nil {
				return *new(Result), err
			}
			validSignature = verifyObject.OK
		}
		if err := chainshared.Check(validSignature); err != nil {
			return *new(Result), err
		}

		_, requestMember := state.Devices[chainshared.ID(context.RequestSigner)]
		if err := chainshared.Check(encoding.Equal(context.RequestSigner, h.Signer) || (h.Op == 10 && context.DestinationPin != nil && requestMember)); err != nil {
			return *new(Result), err
		}
		if h.Op == 10 && context.DestinationPin != nil {
			if err := checkDestination(swap, context.DestinationPin); err != nil {
				return *new(Result), err
			}
		}
		_, err = payload.CheckPayload(swap, context)
		if err != nil {
			return *new(Result), err
		}

		return Result{Kind: "valid", Authorization: auth, State: state}, nil
	})
	result := tryResult
	if chainshared.Invalid(err) {
		return Result{Kind: "invalid"}, nil
	}

	return result, err
}

func checkDestination(swap manifests.Swap, pin []byte) error {
	if err := chainshared.Check(len(swap.Entries) > 0 && swap.Entries[0].Body.Kind == 5); err != nil {
		return err
	}

	return chainshared.Check(encoding.Equal(swap.Entries[0].Body.Payload.(entrypayloads.ServerMoved).NewPin, pin))
}
