package devices

import model "github.com/notsuhas/envden/go/core/chain/devices/state"

type State = model.State

type Result struct {
	Kind  string
	State *State
}
