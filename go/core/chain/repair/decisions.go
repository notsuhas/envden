package repair

import (
	"sort"

	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type History struct {
	Header manifests.ManifestHeader
	Files  *manifests.Files
}

type CandidateInput struct {
	FileId         []byte
	BeforeVersion  uint64
	History        []History
	AvailableBlobs map[string]bool
}

type CandidateResult struct {
	Kind   string
	Entry  *manifests.FileEntry
	Header *manifests.ManifestHeader
}

func ChooseRecoveryCandidate(input CandidateInput) (CandidateResult, error) {
	return chainshared.TryResult(func() (CandidateResult, error) {
		history := append([]History(nil), input.History...)
		sort.SliceStable(history, func(i, j int) bool { return history[i].Header.Seq > history[j].Header.Seq })
		for _, h := range history {
			if h.Files == nil || !encoding.Equal(crypto.H("files", manifests.FilesCodec.Write(*h.Files)), h.Header.FilesHash) {
				return CandidateResult{Kind: "lost"}, nil
			}
			for _, entry := range h.Files.Entries {
				if !encoding.Equal(entry.FileId, input.FileId) {
					continue
				}
				if entry.Version >= input.BeforeVersion {
					break
				}
				if entry.State == 2 || entry.State == 4 {
					return CandidateResult{Kind: "lost"}, nil
				}
				if input.AvailableBlobs[chainshared.ID(entry.BlobHash)] {
					return CandidateResult{Kind: "recovered", Entry: &entry, Header: &h.Header}, nil
				}
			}
		}

		return CandidateResult{Kind: "lost"}, nil
	})
}

func RepairLoginDecision(headers []manifests.ManifestHeader) string {
	for _, h := range headers {
		if h.Op == 8 || h.Op == 9 {
			return "register"
		}
	}

	return "login"
}

func RefuseSecretKeyProof(headers []manifests.ManifestHeader, envelopeMatchesHead bool) bool {
	if !envelopeMatchesHead {
		return true
	}
	for _, h := range headers {
		if h.Op == 5 || h.Op == 7 {
			return true
		}
	}

	return false
}

func IsReusedRepairToken(repairId []byte, repairIds map[string]bool) bool {
	return repairIds[chainshared.ID(repairId)]
}
