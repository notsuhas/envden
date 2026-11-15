package completion

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/cli/version"
	r "github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/chain/unknown"
	"github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto/objects"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RepairReports(ctx context.Context, c *shared.Context, h shared.History, repairID []byte) ([]b.Signed[s.RepairReport], error) {
	encoded, err := routes.Do(ctx, c.Client, routes.Route[s.ObjectsResponse]{Path: "/v1/repair/reports", Method: "GET", Schema: s.ObjectsResponseSchema}, nil)
	if err != nil {
		return nil, err
	}
	members := []objects.Member{}
	for _, id := range h.State.DeviceOrder {
		d := h.State.Devices[id]
		members = append(members, objects.Member{Id: d.Id, ObjPub: d.ObjPub})
	}
	reports := []b.Signed[s.RepairReport]{}
	latest := c.Local.Latest
	if latest == "" {
		latest = version.Version
	}
	for _, encoded := range encoded.Objects {
		raw, e := client.Binary(encoded)
		if e != nil {
			return nil, e
		}
		result, e := unknown.DecodeServerObject(unknown.DecodeInput[s.RepairReport]{Received: raw, Codec: s.RepairReportCodec, Label: "repair-report", Mismatch: "fork", Members: members, CurrentVersion: version.Version, LatestVersion: latest})
		if e != nil {
			return nil, e
		}
		switch result.Kind {
		case "known":
			reports = append(reports, *result.Value)
		case "update-required":
			return nil, errors.New(errors.UpdateRequired, "Update envden to read server data")
		case "unreadable":
			return nil, errors.New(errors.InvalidData, "Unreadable data from server")
		}
	}
	hashes := map[string]bool{}
	for _, h := range h.Headers {
		hashes[b.Base32(shared.HeaderHash(h))] = true
	}
	return r.FilterRepairReports(r.ReportsInput{Reports: reports, RepairId: repairID, State: h.State, HeaderHashes: hashes})
}
