package devices

import (
	"github.com/notsuhas/envden/go/core/chain/devices/transitions"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
)

func ApplyEntry(state *State, signed codecs.Signed[codecs.Entry]) (Result, error) {
	apply, err := transitions.Apply(state, signed)
	next := apply
	if chainshared.Invalid(err) {
		return Result{Kind: "invalid"}, nil
	}
	if err != nil {
		return Result{}, err
	}

	return Result{Kind: "valid", State: next}, nil
}

func VerifyChain(entries []codecs.Signed[codecs.Entry]) (Result, error) {
	var state *State
	for _, entry := range entries {
		applyEntry, err := ApplyEntry(state, entry)
		if err != nil {
			return *new(Result), err
		}

		r := applyEntry
		if err != nil || r.Kind == "invalid" {
			return r, err
		}
		state = r.State
	}
	if state == nil {
		return Result{Kind: "invalid"}, nil
	}

	return Result{Kind: "valid", State: state}, nil
}
