package devices

import (
	"github.com/notsuhas/envden/go/core/chain/devices/transitions"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
)

func ApplyEntry(state *State, signed c.Signed[c.Entry]) (Result, error) {
	next, err := transitions.Apply(state, signed)
	if s.Invalid(err) {
		return Result{Kind: "invalid"}, nil
	}
	if err != nil {
		return Result{}, err
	}

	return Result{Kind: "valid", State: next}, nil
}

func VerifyChain(entries []c.Signed[c.Entry]) (Result, error) {
	var state *State
	for _, entry := range entries {
		r, err := ApplyEntry(state, entry)
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
