package manifests

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type NonMemberInput struct {
	DeviceId                       []byte
	StoredHeaders, VerifiedHeaders []b.Signed[m.ManifestHeader]
	StoredEntries, VerifiedEntries []b.Signed[c.Entry]
	State                          *d.State
}

type NonMemberResult struct {
	Kind  string
	Entry *b.Signed[c.Entry]
}

func ClassifyNonMember(input NonMemberInput) (NonMemberResult, error) {

	return s.Try(func() NonMemberResult {
		if len(input.StoredHeaders) == 0 || len(input.VerifiedHeaders) == 0 {
			return NonMemberResult{Kind: "fork"}
		}
		checkpoint := input.StoredHeaders[len(input.StoredHeaders)-1]
		head := input.VerifiedHeaders[len(input.VerifiedHeaders)-1]
		stored := map[string]bool{}
		for _, h := range input.StoredHeaders {
			stored[s.ID(headerHash(h))] = true
		}
		descends := false
		for _, h := range input.VerifiedHeaders {
			if b.Equal(headerHash(h), headerHash(checkpoint)) {
				descends = true
			}
		}
		fallback := "fork"
		if stored[s.ID(headerHash(head))] {
			fallback = "rollback"
		}
		if _, ok := input.State.Devices[s.ID(input.DeviceId)]; ok {
			return NonMemberResult{Kind: fallback}
		}
		if descends {
			for _, entry := range input.VerifiedEntries {
				if entry.Body.Seq > checkpoint.Body.ListSeq && entry.Body.Kind == 2 && b.Equal(entry.Body.Payload.(p.RemoveDevice).Device, input.DeviceId) {
					return NonMemberResult{Kind: "removed", Entry: &entry}
				}
			}
		}
		if !descends && droppedByRepair(input, checkpoint, stored) {
			return NonMemberResult{Kind: "dropped-by-repair"}
		}
		return NonMemberResult{Kind: fallback}
	})
}

func droppedByRepair(input NonMemberInput, checkpoint b.Signed[m.ManifestHeader], stored map[string]bool) bool {
	split := -1
	for i, h := range input.VerifiedHeaders {
		if !stored[s.ID(headerHash(h))] {
			split = i
			break
		}
	}
	entries := []b.Signed[c.Entry]{}
	for _, e := range input.StoredEntries {
		if e.Body.Seq <= checkpoint.Body.ListSeq {
			entries = append(entries, e)
		}
	}
	chain := b.Must(d.VerifyChain(entries))
	if split < 1 || chain.Kind != "valid" || !b.Equal(chain.State.Head, checkpoint.Body.ListHead) {
		return false
	}
	former := map[string]bool{}
	for id := range chain.State.EverUsedIds {
		_, ok := chain.State.Devices[id]
		if !ok && id != s.ID(chain.State.Recovery.Id) {
			former[id] = true
		}
	}
	for id := range input.State.Devices {
		if former[id] {
			return false
		}
	}
	if former[s.ID(input.State.Recovery.Id)] {
		return false
	}
	for _, h := range input.VerifiedHeaders[split:] {
		if former[s.ID(h.Body.Signer)] {
			return false
		}
	}
	common := map[string]bool{}
	for _, h := range input.VerifiedHeaders[:split] {
		common[s.ID(headerHash(h))] = true
	}
	repair := false
	for _, e := range input.VerifiedEntries {
		if e.Body.Seq <= input.VerifiedHeaders[split-1].Body.ListSeq {
			continue
		}
		if former[s.ID(e.Body.Signer)] {
			return false
		}
		if e.Body.Kind == 6 && common[s.ID(e.Body.Payload.(p.RepairDone).RestoredHead)] {
			repair = true
		}
	}

	return repair
}
