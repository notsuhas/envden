package transitions

import (
	"maps"

	model "github.com/notsuhas/envden/go/core/chain/devices/state"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	ep "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Apply(state *model.State, signed c.Signed[c.Entry]) (*model.State, error) {

	return s.Try(func() *model.State { return apply(state, signed) })
}

func apply(state *model.State, signed c.Signed[c.Entry]) *model.State {
	entry := signed.Body
	encoded := c.EntryCodec.Write(entry)
	head := cr.H("hash/entry", b.Concat(encoded, b.B64.Write(signed.Signature)))
	if state == nil {
		return createState(signed, head, encoded)
	}
	s.Check(b.Equal(entry.VaultId, state.VaultId) && entry.Seq == state.Seq+1 && state.Seq != ^uint64(0) && b.Equal(entry.Parent, state.Head))
	s.Check(entry.Seq != 1 || entry.Kind == 3)
	signer, ok := state.Devices[s.ID(entry.Signer)]
	recoverySigned := b.Equal(entry.Signer, state.Recovery.Id)
	s.Check(ok || (recoverySigned && entry.Kind == 1))
	pub := state.Recovery.ObjPub
	if ok {
		pub = signer.ObjPub
	}
	s.Check(cr.Verify(pub, "entry", encoded, signed.Signature).OK)
	next := *state
	next.Devices = maps.Clone(state.Devices)
	next.DeviceOrder = append([]string(nil), state.DeviceOrder...)
	next.EverUsedIds = maps.Clone(state.EverUsedIds)
	next.RepairIds = maps.Clone(state.RepairIds)
	next.Commits = maps.Clone(state.Commits)
	transition(&next, entry)
	if entry.Kind == 4 || (entry.Kind == 2 && entry.Payload.(p.RemoveDevice).NewRecovery != nil) {
		s.Check(!next.EverUsedIds[s.ID(next.Recovery.Id)])
		next.EverUsedIds[s.ID(next.Recovery.Id)] = true
	}
	var change *ep.EpochChange
	switch v := entry.Payload.(type) {
	case p.RemoveDevice:
		change = &v.Change
	case p.NewEpoch:
		change = &v.Change
	case p.ReplaceRecovery:
		change = &v.Change
	}
	if change != nil {
		s.Check(change.Epoch == state.Epoch+1)
		members := map[string]bool{s.ID(next.Recovery.Id): true}
		for id := range next.Devices {
			members[id] = true
		}
		s.Check(len(change.Wraps) == len(members))
		for _, w := range change.Wraps {
			s.Check(members[s.ID(w.Recipient)])
		}
		next.Epoch = change.Epoch
		next.Commits[next.Epoch] = change.KeyCommit
	}
	next.Seq = entry.Seq
	next.Head = head

	return &next
}

func createState(signed c.Signed[c.Entry], head, encoded []byte) *model.State {
	entry := signed.Body
	s.Check(entry.Kind == 0 && entry.Seq == 0 && zero(entry.VaultId) && zero(entry.Parent))
	v := entry.Payload.(p.Genesis)
	s.Check(b.Equal(entry.Signer, v.Device.Id))
	s.Check(cr.Verify(v.Device.ObjPub, "entry", encoded, signed.Signature).OK)
	s.Check(!b.Equal(v.Device.Id, v.Recovery.Id))

	return &model.State{DeviceOrder: []string{s.ID(v.Device.Id)}, VaultId: head, Head: head, Devices: map[string]m.DeviceRecord{s.ID(v.Device.Id): v.Device}, Recovery: v.Recovery, ServerPin: v.ServerPin, EverUsedIds: map[string]bool{s.ID(v.Device.Id): true, s.ID(v.Recovery.Id): true}, RepairIds: map[string]bool{}, Commits: map[int][]byte{}}
}

func zero(v []byte) bool {
	for _, x := range v {
		if x != 0 {
			return false
		}
	}

	return true
}
