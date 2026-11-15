package remote

import (
	"encoding/json"
	"sort"
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	j "github.com/notsuhas/envden/go/cli/jsonvalue"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	mem "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func taggedBytes(v []byte) j.Object { return j.Object{{Key: "$bytes", Value: client.Text(v)}} }
func deviceRecord(v mem.DeviceRecord) j.Object {
	return j.Object{{Key: "id", Value: taggedBytes(v.Id)}, {Key: "name", Value: v.Name}, {Key: "encPub", Value: taggedBytes(v.EncPub)}, {Key: "objPub", Value: taggedBytes(v.ObjPub)}, {Key: "reqPub", Value: taggedBytes(v.ReqPub)}}
}

func verifiedState(context *sm.Context) (json.RawMessage, error) {
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
		key := b.Base32(id)
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
		case p.Genesis:
			add(v.Device.Id)
			add(v.Recovery.Id)
		case p.AddDevice:
			add(v.Device.Id)
		case p.RemoveDevice:
			if v.NewRecovery != nil {
				add(v.NewRecovery.Id)
			}
		case p.ReplaceRecovery:
			add(v.Recovery.Id)
		case p.RepairDone:
			repairs = append(repairs, b.Base32(v.RepairId))
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
	recovery := j.Object{{Key: "id", Value: taggedBytes(s.Recovery.Id)}, {Key: "encPub", Value: taggedBytes(s.Recovery.EncPub)}, {Key: "objPub", Value: taggedBytes(s.Recovery.ObjPub)}}

	return j.Marshal(j.Object{{Key: "vaultId", Value: taggedBytes(s.VaultId)}, {Key: "seq", Value: j.Object{{Key: "$bigint", Value: strconv.FormatUint(s.Seq, 10)}}}, {Key: "head", Value: taggedBytes(s.Head)}, {Key: "devices", Value: j.Object{{Key: "$map", Value: devices}}}, {Key: "recovery", Value: recovery}, {Key: "epoch", Value: s.Epoch}, {Key: "serverPin", Value: taggedBytes(s.ServerPin)}, {Key: "everUsedIds", Value: j.Object{{Key: "$set", Value: used}}}, {Key: "repairIds", Value: j.Object{{Key: "$set", Value: repairs}}}, {Key: "commits", Value: j.Object{{Key: "$map", Value: commits}}}})
}
