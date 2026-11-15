package repair

import (
	"sort"

	s "github.com/notsuhas/envden/go/core/chain/shared"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type History struct {
	Header m.ManifestHeader
	Files  *m.Files
}

type CandidateInput struct {
	FileId         []byte
	BeforeVersion  uint64
	History        []History
	AvailableBlobs map[string]bool
}

type CandidateResult struct {
	Kind   string
	Entry  *m.FileEntry
	Header *m.ManifestHeader
}

func ChooseRecoveryCandidate(input CandidateInput) (CandidateResult, error) {

	return s.Try(func() CandidateResult {
		history := append([]History(nil), input.History...)
		sort.SliceStable(history, func(i, j int) bool { return history[i].Header.Seq > history[j].Header.Seq })
		for _, h := range history {
			if h.Files == nil || !b.Equal(cr.H("files", m.FilesCodec.Write(*h.Files)), h.Header.FilesHash) {
				return CandidateResult{Kind: "lost"}
			}
			for _, entry := range h.Files.Entries {
				if !b.Equal(entry.FileId, input.FileId) {
					continue
				}
				if entry.Version >= input.BeforeVersion {
					break
				}
				if entry.State == 2 || entry.State == 4 {
					return CandidateResult{Kind: "lost"}
				}
				if input.AvailableBlobs[s.ID(entry.BlobHash)] {
					return CandidateResult{Kind: "recovered", Entry: &entry, Header: &h.Header}
				}
			}
		}
		return CandidateResult{Kind: "lost"}
	})
}

func RepairLoginDecision(headers []m.ManifestHeader) string {
	for _, h := range headers {
		if h.Op == 8 || h.Op == 9 {
			return "register"
		}
	}

	return "login"
}

func RefuseSecretKeyProof(headers []m.ManifestHeader, envelopeMatchesHead bool) bool {
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

	return repairIds[s.ID(repairId)]
}
