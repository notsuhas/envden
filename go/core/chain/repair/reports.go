package repair

import (
	"sort"

	d "github.com/notsuhas/envden/go/core/chain/devices"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	mem "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	server "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ReportsInput struct {
	Reports      []b.Signed[server.RepairReport]
	RepairId     []byte
	State        *d.State
	HeaderHashes map[string]bool
}

func FilterRepairReports(input ReportsInput) ([]b.Signed[server.RepairReport], error) {

	return s.Try(func() []b.Signed[server.RepairReport] {
		out := []b.Signed[server.RepairReport]{}
		for _, report := range input.Reports {
			r := report.Body
			signer, ok := input.State.Devices[s.ID(r.Signer)]
			if ok && b.Equal(r.VaultId, input.State.VaultId) && b.Equal(r.RepairId, input.RepairId) && input.HeaderHashes[s.ID(r.Head)] && b.Must(cr.VerifyObject(server.RepairReportCodec, report, signer.ObjPub, "repair-report")).OK {
				out = append(out, report)
			}
		}
		return out
	})
}

func MissingReportMembers(state *d.State, reports []b.Signed[server.RepairReport]) []mem.DeviceRecord {
	signers := map[string]bool{}
	for _, r := range reports {
		signers[s.ID(r.Body.Signer)] = true
	}
	out := []mem.DeviceRecord{}
	for _, id := range state.DeviceOrder {
		if d, ok := state.Devices[id]; ok && !signers[id] {
			out = append(out, d)
		}
	}
	if len(state.DeviceOrder) == 0 {
		for id, d := range state.Devices {
			if !signers[id] {
				out = append(out, d)
			}
		}
		sort.SliceStable(out, func(i, j int) bool { return b.Compare(out[i].Id, out[j].Id) < 0 })
	}

	return out
}

type MissingBlobs struct{ Missing, Lost []m.FileEntry }

func ClassifyMissingBlobs(files m.Files, available map[string]bool, reports []b.Signed[server.RepairReport]) MissingBlobs {
	reported := map[string]bool{}
	for _, r := range reports {
		for _, blob := range r.Body.Blobs {
			reported[s.ID(blob)] = true
		}
	}
	out := MissingBlobs{Missing: []m.FileEntry{}, Lost: []m.FileEntry{}}
	for _, e := range files.Entries {
		if (e.State == 1 || e.State == 3) && !available[s.ID(e.BlobHash)] {
			if reported[s.ID(e.BlobHash)] {
				out.Missing = append(out.Missing, e)
			} else {
				out.Lost = append(out.Lost, e)
			}
		}
	}

	return out
}
