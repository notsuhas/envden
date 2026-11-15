package repair

import (
	"sort"

	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	mem "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ReportsInput struct {
	Reports      []encoding.Signed[server.RepairReport]
	RepairId     []byte
	State        *devicechain.State
	HeaderHashes map[string]bool
}

func FilterRepairReports(input ReportsInput) ([]encoding.Signed[server.RepairReport], error) {
	return chainshared.TryResult(func() ([]encoding.Signed[server.RepairReport], error) {
		out := []encoding.Signed[server.RepairReport]{}
		for _, report := range input.Reports {
			r := report.Body
			signer, ok := input.State.Devices[chainshared.ID(r.Signer)]
			validReport := ok && encoding.Equal(r.VaultId, input.State.VaultId) && encoding.Equal(r.RepairId, input.RepairId) && input.HeaderHashes[chainshared.ID(r.Head)]
			if validReport {
				verifyObject, err := crypto.VerifyObject(server.RepairReportCodec, report, signer.ObjPub, "repair-report")
				if err != nil {
					return nil, err
				}
				validReport = verifyObject.OK
			}
			if validReport {
				out = append(out, report)
			}
		}

		return out, nil
	})
}

func MissingReportMembers(state *devicechain.State, reports []encoding.Signed[server.RepairReport]) []mem.DeviceRecord {
	signers := map[string]bool{}
	for _, r := range reports {
		signers[chainshared.ID(r.Body.Signer)] = true
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
		sort.SliceStable(out, func(i, j int) bool { return encoding.Compare(out[i].Id, out[j].Id) < 0 })
	}

	return out
}

type MissingBlobs struct{ Missing, Lost []manifests.FileEntry }

func ClassifyMissingBlobs(files manifests.Files, available map[string]bool, reports []encoding.Signed[server.RepairReport]) MissingBlobs {
	reported := map[string]bool{}
	for _, r := range reports {
		for _, blob := range r.Body.Blobs {
			reported[chainshared.ID(blob)] = true
		}
	}
	out := MissingBlobs{Missing: []manifests.FileEntry{}, Lost: []manifests.FileEntry{}}
	for _, e := range files.Entries {
		if (e.State == 1 || e.State == 3) && !available[chainshared.ID(e.BlobHash)] {
			if reported[chainshared.ID(e.BlobHash)] {
				out.Missing = append(out.Missing, e)
			} else {
				out.Lost = append(out.Lost, e)
			}
		}
	}

	return out
}
