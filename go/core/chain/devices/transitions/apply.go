package transitions

import (
	"maps"

	model "github.com/notsuhas/envden/go/core/chain/devices/state"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Apply(state *model.State, signed codecs.Signed[codecs.Entry]) (*model.State, error) {
	return chainshared.TryResult(func() (*model.State, error) {
		return apply(state, signed)
	})
}

func apply(state *model.State, signed codecs.Signed[codecs.Entry]) (*model.State, error) {
	entry := signed.Body
	encoded := codecs.EntryCodec.Write(entry)
	head := crypto.H("hash/entry", encoding.Concat(encoded, encoding.B64.Write(signed.Signature)))
	if state == nil {
		return createState(signed, head, encoded)
	}
	if err := chainshared.Check(encoding.Equal(entry.VaultId, state.VaultId) && entry.Seq == state.Seq+1 && state.Seq != ^uint64(0) && encoding.Equal(entry.Parent, state.Head)); err != nil {
		return nil, err
	}
	if err := chainshared.Check(entry.Seq != 1 || entry.Kind == 3); err != nil {
		return nil, err
	}

	signer, ok := state.Devices[chainshared.ID(entry.Signer)]
	recoverySigned := encoding.Equal(entry.Signer, state.Recovery.Id)
	if err := chainshared.Check(ok || (recoverySigned && entry.Kind == 1)); err != nil {
		return nil, err
	}

	pub := state.Recovery.ObjPub
	if ok {
		pub = signer.ObjPub
	}
	if err := chainshared.Check(crypto.Verify(pub, "entry", encoded, signed.Signature).OK); err != nil {
		return nil, err
	}

	next := *state
	next.Devices = maps.Clone(state.Devices)
	next.DeviceOrder = append([]string(nil), state.DeviceOrder...)
	next.EverUsedIds = maps.Clone(state.EverUsedIds)
	next.RepairIds = maps.Clone(state.RepairIds)
	next.Commits = maps.Clone(state.Commits)
	if err := transition(&next, entry); err != nil {
		return nil, err
	}
	if entry.Kind == 4 || (entry.Kind == 2 && entry.Payload.(entrypayloads.RemoveDevice).NewRecovery != nil) {
		if err := chainshared.Check(!next.EverUsedIds[chainshared.ID(next.Recovery.Id)]); err != nil {
			return nil, err
		}

		next.EverUsedIds[chainshared.ID(next.Recovery.Id)] = true
	}
	var change *epochs.EpochChange
	switch v := entry.Payload.(type) {
	case entrypayloads.RemoveDevice:
		change = &v.Change
	case entrypayloads.NewEpoch:
		change = &v.Change
	case entrypayloads.ReplaceRecovery:
		change = &v.Change
	}
	if change != nil {
		if err := chainshared.Check(change.Epoch == state.Epoch+1); err != nil {
			return nil, err
		}

		members := map[string]bool{chainshared.ID(next.Recovery.Id): true}
		for id := range next.Devices {
			members[id] = true
		}
		if err := chainshared.Check(len(change.Wraps) == len(members)); err != nil {
			return nil, err
		}

		for _, w := range change.Wraps {
			if err := chainshared.Check(members[chainshared.ID(w.Recipient)]); err != nil {
				return nil, err
			}
		}
		next.Epoch = change.Epoch
		next.Commits[next.Epoch] = change.KeyCommit
	}
	next.Seq = entry.Seq
	next.Head = head

	return &next, nil
}

func createState(signed codecs.Signed[codecs.Entry], head, encoded []byte) (*model.State, error) {
	entry := signed.Body
	if err := chainshared.Check(entry.Kind == 0 && entry.Seq == 0 && zero(entry.VaultId) && zero(entry.Parent)); err != nil {
		return nil, err
	}

	v := entry.Payload.(entrypayloads.Genesis)
	if err := chainshared.Check(encoding.Equal(entry.Signer, v.Device.Id)); err != nil {
		return nil, err
	}
	if err := chainshared.Check(crypto.Verify(v.Device.ObjPub, "entry", encoded, signed.Signature).OK); err != nil {
		return nil, err
	}
	if err := chainshared.Check(!encoding.Equal(v.Device.Id, v.Recovery.Id)); err != nil {
		return nil, err
	}

	return &model.State{DeviceOrder: []string{chainshared.ID(v.Device.Id)}, VaultId: head, Head: head, Devices: map[string]members.DeviceRecord{chainshared.ID(v.Device.Id): v.Device}, Recovery: v.Recovery, ServerPin: v.ServerPin, EverUsedIds: map[string]bool{chainshared.ID(v.Device.Id): true, chainshared.ID(v.Recovery.Id): true}, RepairIds: map[string]bool{}, Commits: map[int][]byte{}}, nil
}

func zero(v []byte) bool {
	for _, x := range v {
		if x != 0 {
			return false
		}
	}

	return true
}
