package transitions

import (
	model "github.com/notsuhas/envden/go/core/chain/devices/state"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func transition(state *model.State, entry codecs.Entry) error {
	switch v := entry.Payload.(type) {
	case entrypayloads.Genesis:
		if err := chainshared.Check(false); err != nil {
			return err
		}
	case entrypayloads.AddDevice:
		d := v.Device
		if err := chainshared.Check(!state.EverUsedIds[chainshared.ID(d.Id)] && len(state.Devices) < 64 && state.Epoch >= 1); err != nil {
			return err
		}
		if err := uniqueName(state, d.Name); err != nil {
			return err
		}
		if err := chainshared.Check(encoding.Equal(v.Wrap.Recipient, d.Id)); err != nil {
			return err
		}
		state.Devices[chainshared.ID(d.Id)] = d
		state.DeviceOrder = append(state.DeviceOrder, chainshared.ID(d.Id))
		state.EverUsedIds[chainshared.ID(d.Id)] = true
	case entrypayloads.RemoveDevice:
		_, ok := state.Devices[chainshared.ID(v.Device)]
		if err := chainshared.Check(ok && len(state.Devices) > 1 && !encoding.Equal(entry.Signer, v.Device)); err != nil {
			return err
		}
		delete(state.Devices, chainshared.ID(v.Device))
		for i, id := range state.DeviceOrder {
			if id == chainshared.ID(v.Device) {
				state.DeviceOrder = append(state.DeviceOrder[:i], state.DeviceOrder[i+1:]...)
				break
			}
		}
		if v.NewRecovery != nil {
			state.Recovery = *v.NewRecovery
		}
	case entrypayloads.ReplaceRecovery:
		state.Recovery = v.Recovery
	case entrypayloads.ServerMoved:
		if err := chainshared.Check(encoding.Equal(v.OldPin, state.ServerPin)); err != nil {
			return err
		}
		state.ServerPin = v.NewPin
	case entrypayloads.RepairDone:
		if err := chainshared.Check(!state.RepairIds[chainshared.ID(v.RepairId)]); err != nil {
			return err
		}
		state.RepairIds[chainshared.ID(v.RepairId)] = true
	case entrypayloads.RenameDevice:
		d, ok := state.Devices[chainshared.ID(v.Device)]
		if err := chainshared.Check(ok && encoding.Equal(entry.Signer, d.Id)); err != nil {
			return err
		}
		if err := uniqueName(state, v.Name); err != nil {
			return err
		}
		d.Name = v.Name
		state.Devices[chainshared.ID(d.Id)] = d
	}

	return nil
}

func uniqueName(state *model.State, name string) error {
	for _, d := range state.Devices {
		if err := chainshared.Check(d.Name != name); err != nil {
			return err
		}
	}

	return nil
}
