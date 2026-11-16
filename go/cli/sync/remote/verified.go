package remote

import (
	"encoding/json"
	"sort"
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func taggedBytes(v []byte) jsonvalue.Object {
	return jsonvalue.Object{{Key: "$bytes", Value: client.Text(v)}}
}

func deviceRecord(v members.DeviceRecord) jsonvalue.Object {
	return jsonvalue.Object{{Key: "id", Value: taggedBytes(v.Id)}, {Key: "name", Value: v.Name}, {Key: "encPub", Value: taggedBytes(v.EncPub)}, {Key: "objPub", Value: taggedBytes(v.ObjPub)}, {Key: "reqPub", Value: taggedBytes(v.ReqPub)}}
}

func verifiedState(context *syncmodel.Context) (json.RawMessage, error) {
	s := context.Checkpoint.State
	devices := []any{}

	for _, id := range s.DeviceOrder {
		if device, ok := s.Devices[id]; ok {
			devices = append(devices, []any{id, deviceRecord(device)})
		}
	}

	used, repairs := []string{}, []string{}
	seen := map[string]bool{}
	add := func(id []byte) {
		key := encoding.Base32(id)

		if !seen[key] {
			used = append(used, key)
			seen[key] = true
		}
	}

	for _, entry := range context.Entries {
		if entry.Body.Seq > s.Seq {
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

	commits := []any{}
	epochs := []int{}

	for epoch := range s.Commits {
		epochs = append(epochs, epoch)
	}

	sort.Ints(epochs)

	for _, epoch := range epochs {
		commits = append(commits, []any{epoch, taggedBytes(s.Commits[epoch])})
	}

	recovery := jsonvalue.Object{{Key: "id", Value: taggedBytes(s.Recovery.Id)}, {Key: "encPub", Value: taggedBytes(s.Recovery.EncPub)}, {Key: "objPub", Value: taggedBytes(s.Recovery.ObjPub)}}

	return jsonvalue.Marshal(jsonvalue.Object{{Key: "vaultId", Value: taggedBytes(s.VaultId)}, {Key: "seq", Value: jsonvalue.Object{{Key: "$bigint", Value: strconv.FormatUint(s.Seq, 10)}}}, {Key: "head", Value: taggedBytes(s.Head)}, {Key: "devices", Value: jsonvalue.Object{{Key: "$map", Value: devices}}}, {Key: "recovery", Value: recovery}, {Key: "epoch", Value: s.Epoch}, {Key: "serverPin", Value: taggedBytes(s.ServerPin)}, {Key: "everUsedIds", Value: jsonvalue.Object{{Key: "$set", Value: used}}}, {Key: "repairIds", Value: jsonvalue.Object{{Key: "$set", Value: repairs}}}, {Key: "commits", Value: jsonvalue.Object{{Key: "$map", Value: commits}}}})
}
