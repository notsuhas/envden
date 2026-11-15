package client

import (
	"bytes"
	"encoding/binary"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/chain/unknown"
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto/objects"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func decodeHistoryObject[T any](received []byte, codec b.Codec[T], label string, state *devices.State, stored [][]byte, latest string) (b.Signed[T], error) {
	members := []objects.Member{}
	for _, d := range state.Devices {
		members = append(members, objects.Member{Id: d.Id, ObjPub: d.ObjPub})
	}
	if label == "entry" {
		members = append(members, objects.Member{Id: state.Recovery.Id, ObjPub: state.Recovery.ObjPub})
	}
	var known []byte
	for _, raw := range stored {
		if bytes.Equal(subseq(raw), subseq(received)) {
			known = raw
			break
		}
	}
	if latest == "" {
		latest = version.Version
	}
	result, err := unknown.DecodeServerObject(unknown.DecodeInput[T]{Received: received, Stored: known, Mismatch: "fork", Members: members, Codec: codec, Label: label, CurrentVersion: version.Version, LatestVersion: latest})
	if err != nil {
		return b.Signed[T]{}, err
	}
	switch result.Kind {
	case "known":
		return *result.Value, nil
	case "fork":
		return b.Signed[T]{}, errors.New(errors.Fork, "Server history forked")
	case "rollback":
		return b.Signed[T]{}, errors.New(errors.Rollback, "Server history rolled back")
	case "update-required":
		return b.Signed[T]{}, errors.New(errors.UpdateRequired, "Update envden to read server data")
	case "unreadable":
		return b.Signed[T]{}, errors.New(errors.InvalidData, "Unreadable data from server")
	}
	return b.Signed[T]{}, errors.New(errors.InvalidData, "Invalid data from server")
}
func subseq(raw []byte) []byte {
	if len(raw) <= 34 {
		return nil
	}
	end := 42
	if len(raw) < end {
		end = len(raw)
	}
	return raw[34:end]
}

type HistoryEntries struct {
	Entries []b.Signed[c.Entry]
	State   *devices.State
	States  map[uint64]*devices.State
}

func DecodeHistoryEntries(raw, stored [][]byte, latest string, initial *devices.State) (HistoryEntries, error) {
	result := HistoryEntries{Entries: []b.Signed[c.Entry]{}, State: initial, States: map[uint64]*devices.State{}}
	if initial != nil {
		result.States[initial.Seq] = initial
	}
	for _, data := range raw {
		var entry b.Signed[c.Entry]
		var err error
		if result.State == nil {
			entry, err = DecodeUntrusted(c.SignedCodec(c.EntryCodec), data)
		} else {
			entry, err = decodeHistoryObject(data, c.EntryCodec, "entry", result.State, stored, latest)
		}
		if err != nil {
			return result, err
		}
		applied, err := devices.ApplyEntry(result.State, entry)
		if err != nil {
			return result, err
		}
		if applied.Kind != "valid" {
			return result, errors.New(errors.InvalidData, "Invalid device list")
		}
		result.State = applied.State
		result.States[result.State.Seq] = result.State
		result.Entries = append(result.Entries, entry)
	}
	if result.State == nil {
		return result, errors.New(errors.InvalidData, "Missing device list")
	}
	return result, nil
}

func DecodeHistoryHeader(raw []byte, entries []b.Signed[c.Entry], stored [][]byte, latest string, states map[uint64]*devices.State) (b.Signed[m.ManifestHeader], error) {
	seq := uint64(0)
	if len(raw) >= 2 && raw[0] == 2 && raw[1] == 1 {
		if len(raw) < 83 {
			return b.Signed[m.ManifestHeader]{}, errors.New(errors.InvalidData, "Truncated data")
		}
		seq = binary.BigEndian.Uint64(raw[75:83])
	} else if len(entries) > 0 {
		seq = entries[len(entries)-1].Body.Seq
	}
	state := states[seq]
	if state == nil {
		filtered := []b.Signed[c.Entry]{}
		for _, entry := range entries {
			if entry.Body.Seq <= seq {
				filtered = append(filtered, entry)
			}
		}
		verified, err := devices.VerifyChain(filtered)
		if err != nil {
			return b.Signed[m.ManifestHeader]{}, err
		}
		if verified.Kind != "valid" {
			return b.Signed[m.ManifestHeader]{}, errors.New(errors.InvalidData, "Invalid device list")
		}
		state = verified.State
	}
	return decodeHistoryObject(raw, m.ManifestHeaderCodec, "manifest", state, stored, latest)
}
