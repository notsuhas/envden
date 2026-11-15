package transitions

import (
	model "github.com/notsuhas/envden/go/core/chain/devices/state"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func transition(state *model.State, entry c.Entry) {
	switch v := entry.Payload.(type) {
	case p.Genesis:
		s.Check(false)
	case p.AddDevice:
		d := v.Device
		s.Check(!state.EverUsedIds[s.ID(d.Id)] && len(state.Devices) < 64 && state.Epoch >= 1)
		uniqueName(state, d.Name)
		s.Check(b.Equal(v.Wrap.Recipient, d.Id))
		state.Devices[s.ID(d.Id)] = d
		state.DeviceOrder = append(state.DeviceOrder, s.ID(d.Id))
		state.EverUsedIds[s.ID(d.Id)] = true
	case p.RemoveDevice:
		_, ok := state.Devices[s.ID(v.Device)]
		s.Check(ok && len(state.Devices) > 1 && !b.Equal(entry.Signer, v.Device))
		delete(state.Devices, s.ID(v.Device))
		for i, id := range state.DeviceOrder {
			if id == s.ID(v.Device) {
				state.DeviceOrder = append(state.DeviceOrder[:i], state.DeviceOrder[i+1:]...)
				break
			}
		}
		if v.NewRecovery != nil {
			state.Recovery = *v.NewRecovery
		}
	case p.ReplaceRecovery:
		state.Recovery = v.Recovery
	case p.ServerMoved:
		s.Check(b.Equal(v.OldPin, state.ServerPin))
		state.ServerPin = v.NewPin
	case p.RepairDone:
		s.Check(!state.RepairIds[s.ID(v.RepairId)])
		state.RepairIds[s.ID(v.RepairId)] = true
	case p.RenameDevice:
		d, ok := state.Devices[s.ID(v.Device)]
		s.Check(ok && b.Equal(entry.Signer, d.Id))
		uniqueName(state, v.Name)
		d.Name = v.Name
		state.Devices[s.ID(d.Id)] = d
	}
}

func uniqueName(state *model.State, name string) {
	for _, d := range state.Devices {
		s.Check(d.Name != name)
	}
}
