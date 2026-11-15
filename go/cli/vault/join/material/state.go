package material

import (
	"encoding/json"
	"sort"
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func StateJSON(state *devices.State, entries []encoding.Signed[codecs.Entry]) (json.RawMessage, error) {
	bytes := func(raw []byte) jsonvalue.Object { return jsonvalue.Object{{Key: "$bytes", Value: client.Text(raw)}} }
	device := func(d members.DeviceRecord) jsonvalue.Object {
		return jsonvalue.Object{{Key: "id", Value: bytes(d.Id)}, {Key: "name", Value: d.Name}, {Key: "encPub", Value: bytes(d.EncPub)}, {Key: "objPub", Value: bytes(d.ObjPub)}, {Key: "reqPub", Value: bytes(d.ReqPub)}}
	}
	devicesJSON := []any{}
	for _, id := range state.DeviceOrder {
		if d, ok := state.Devices[id]; ok {
			devicesJSON = append(devicesJSON, []any{id, device(d)})
		}
	}

	ever, repairs := []string{}, []string{}
	seen := map[string]bool{}
	add := func(raw []byte) {
		id := encoding.Base32(raw)
		if !seen[id] {
			seen[id] = true
			ever = append(ever, id)
		}
	}
	for _, entry := range entries {
		if entry.Body.Seq > state.Seq {
			break
		}

		switch v := entry.Body.Payload.(type) {
		case entrypayloads.Genesis:
			add(v.Device.Id)
			add(v.Recovery.Id)
		case entrypayloads.AddDevice:
			add(v.Device.Id)
		case entrypayloads.RemoveDevice:
			if v.NewRecovery != nil {
				add(v.NewRecovery.Id)
			}
		case entrypayloads.ReplaceRecovery:
			add(v.Recovery.Id)
		case entrypayloads.RepairDone:
			repairs = append(repairs, encoding.Base32(v.RepairId))
		}
	}

	epochs := []int{}
	for epoch := range state.Commits {
		epochs = append(epochs, epoch)
	}

	sort.Ints(epochs)
	commits := []any{}
	for _, epoch := range epochs {
		commits = append(commits, []any{epoch, bytes(state.Commits[epoch])})
	}

	recovery := state.Recovery
	object := jsonvalue.Object{{Key: "vaultId", Value: bytes(state.VaultId)}, {Key: "seq", Value: jsonvalue.Object{{Key: "$bigint", Value: strconv.FormatUint(state.Seq, 10)}}}, {Key: "head", Value: bytes(state.Head)}, {Key: "devices", Value: jsonvalue.Object{{Key: "$map", Value: devicesJSON}}}, {Key: "recovery", Value: jsonvalue.Object{{Key: "id", Value: bytes(recovery.Id)}, {Key: "encPub", Value: bytes(recovery.EncPub)}, {Key: "objPub", Value: bytes(recovery.ObjPub)}}}, {Key: "epoch", Value: state.Epoch}, {Key: "serverPin", Value: bytes(state.ServerPin)}, {Key: "everUsedIds", Value: jsonvalue.Object{{Key: "$set", Value: ever}}}, {Key: "repairIds", Value: jsonvalue.Object{{Key: "$set", Value: repairs}}}, {Key: "commits", Value: jsonvalue.Object{{Key: "$map", Value: commits}}}}

	return jsonvalue.Marshal(object)
}
