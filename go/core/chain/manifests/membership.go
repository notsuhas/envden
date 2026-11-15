package manifests

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type NonMemberInput struct {
	DeviceId                       []byte
	StoredHeaders, VerifiedHeaders []encoding.Signed[manifests.ManifestHeader]
	StoredEntries, VerifiedEntries []encoding.Signed[codecs.Entry]
	State                          *devicechain.State
}

type NonMemberResult struct {
	Kind  string
	Entry *encoding.Signed[codecs.Entry]
}

func ClassifyNonMember(input NonMemberInput) (NonMemberResult, error) {
	return chainshared.TryResult(func() (NonMemberResult, error) {
		if len(input.StoredHeaders) == 0 || len(input.VerifiedHeaders) == 0 {
			return NonMemberResult{Kind: "fork"}, nil
		}
		checkpoint := input.StoredHeaders[len(input.StoredHeaders)-1]
		head := input.VerifiedHeaders[len(input.VerifiedHeaders)-1]
		stored := map[string]bool{}
		for _, h := range input.StoredHeaders {
			hash, err := headerHash(h)
			if err != nil {
				return NonMemberResult{}, err
			}
			stored[chainshared.ID(hash)] = true
		}
		descends := false
		for _, h := range input.VerifiedHeaders {
			headerHashResult, err := headerHash(h)
			if err != nil {
				return *new(NonMemberResult), err
			}
			headerHashResult2, err := headerHash(checkpoint)
			if err != nil {
				return *new(NonMemberResult), err
			}
			if encoding.Equal(headerHashResult, headerHashResult2) {
				descends = true
			}
		}
		fallback := "fork"
		headerHashResult3, err := headerHash(head)
		if err != nil {
			return *new(NonMemberResult), err
		}
		if stored[chainshared.ID(headerHashResult3)] {
			fallback = "rollback"
		}
		_, ok := input.State.Devices[chainshared.ID(input.DeviceId)]
		if ok {
			return NonMemberResult{Kind: fallback}, nil
		}
		if descends {
			for _, entry := range input.VerifiedEntries {
				if entry.Body.Seq > checkpoint.Body.ListSeq && entry.Body.Kind == 2 && encoding.Equal(entry.Body.Payload.(entrypayloads.RemoveDevice).Device, input.DeviceId) {
					return NonMemberResult{Kind: "removed", Entry: &entry}, nil
				}
			}
		}
		repairRemovedMember := !descends
		if repairRemovedMember {
			droppedByRepairResult, err := droppedByRepair(input, checkpoint, stored)
			if err != nil {
				return *new(NonMemberResult), err
			}
			repairRemovedMember = droppedByRepairResult
		}
		if repairRemovedMember {
			return NonMemberResult{Kind: "dropped-by-repair"}, nil
		}

		return NonMemberResult{Kind: fallback}, nil
	})
}

func droppedByRepair(input NonMemberInput, checkpoint encoding.Signed[manifests.ManifestHeader], stored map[string]bool) (bool, error) {
	split := -1
	for i, h := range input.VerifiedHeaders {
		headerHashResult, err := headerHash(h)
		if err != nil {
			return false, err
		}
		if !stored[chainshared.ID(headerHashResult)] {
			split = i
			break
		}
	}
	entries := []encoding.Signed[codecs.Entry]{}
	for _, e := range input.StoredEntries {
		if e.Body.Seq <= checkpoint.Body.ListSeq {
			entries = append(entries, e)
		}
	}
	chain, err := devicechain.VerifyChain(entries)
	if err != nil {
		return false, err
	}
	if split < 1 || chain.Kind != "valid" || !encoding.Equal(chain.State.Head, checkpoint.Body.ListHead) {
		return false, nil
	}
	former := map[string]bool{}
	for id := range chain.State.EverUsedIds {
		_, ok := chain.State.Devices[id]
		if !ok && id != chainshared.ID(chain.State.Recovery.Id) {
			former[id] = true
		}
	}
	for id := range input.State.Devices {
		if former[id] {
			return false, nil
		}
	}
	if former[chainshared.ID(input.State.Recovery.Id)] {
		return false, nil
	}
	for _, h := range input.VerifiedHeaders[split:] {
		if former[chainshared.ID(h.Body.Signer)] {
			return false, nil
		}
	}
	common := map[string]bool{}
	for _, h := range input.VerifiedHeaders[:split] {
		hash, err := headerHash(h)
		if err != nil {
			return false, err
		}
		common[chainshared.ID(hash)] = true
	}
	repair := false
	for _, e := range input.VerifiedEntries {
		if e.Body.Seq <= input.VerifiedHeaders[split-1].Body.ListSeq {
			continue
		}
		if former[chainshared.ID(e.Body.Signer)] {
			return false, nil
		}
		if e.Body.Kind == 6 && common[chainshared.ID(e.Body.Payload.(entrypayloads.RepairDone).RestoredHead)] {
			repair = true
		}
	}

	return repair, nil
}
