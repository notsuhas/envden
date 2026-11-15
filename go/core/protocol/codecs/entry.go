package codecs

import (
	e "github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type EntryPayload struct {
	Kind    int
	Payload any
}
type Entry struct {
	VaultId []byte
	Seq     uint64
	Parent  []byte
	EntryPayload
	Signer []byte
}

func readPayload(r *b.Reader) EntryPayload {
	kind := b.U8.Read(r)
	switch kind {
	case 0:
		return EntryPayload{kind, p.GenesisCodec.Read(r)}
	case 1:
		return EntryPayload{kind, p.AddDeviceCodec.Read(r)}
	case 2:
		return EntryPayload{kind, p.RemoveDeviceCodec.Read(r)}
	case 3:
		return EntryPayload{kind, p.NewEpochCodec.Read(r)}
	case 4:
		return EntryPayload{kind, p.ReplaceRecoveryCodec.Read(r)}
	case 5:
		return EntryPayload{kind, p.ServerMovedCodec.Read(r)}
	case 6:
		return EntryPayload{kind, p.RepairDoneCodec.Read(r)}
	case 7:
		return EntryPayload{kind, p.RenameDeviceCodec.Read(r)}
	default:
		panic(e.New(e.UpdateRequired, "Unknown entry kind"))
	}
}

func writePayload(v EntryPayload) []byte {
	var data []byte
	switch v.Kind {
	case 0:
		x, ok := v.Payload.(p.Genesis)
		b.RequireValue(ok)
		data = p.GenesisCodec.Write(x)
	case 1:
		x, ok := v.Payload.(p.AddDevice)
		b.RequireValue(ok)
		data = p.AddDeviceCodec.Write(x)
	case 2:
		x, ok := v.Payload.(p.RemoveDevice)
		b.RequireValue(ok)
		data = p.RemoveDeviceCodec.Write(x)
	case 3:
		x, ok := v.Payload.(p.NewEpoch)
		b.RequireValue(ok)
		data = p.NewEpochCodec.Write(x)
	case 4:
		x, ok := v.Payload.(p.ReplaceRecovery)
		b.RequireValue(ok)
		data = p.ReplaceRecoveryCodec.Write(x)
	case 5:
		x, ok := v.Payload.(p.ServerMoved)
		b.RequireValue(ok)
		data = p.ServerMovedCodec.Write(x)
	case 6:
		x, ok := v.Payload.(p.RepairDone)
		b.RequireValue(ok)
		data = p.RepairDoneCodec.Write(x)
	case 7:
		x, ok := v.Payload.(p.RenameDevice)
		b.RequireValue(ok)
		data = p.RenameDeviceCodec.Write(x)
	default:
		panic(e.New(e.UpdateRequired, "Unknown entry kind"))
	}
	return b.Concat(b.U8.Write(v.Kind), data)
}

var PayloadCodec = b.Codec[EntryPayload]{Read: readPayload, Write: writePayload}
var EntryCodec = b.Codec[Entry]{Read: func(r *b.Reader) Entry {
	b.Tagged(1, r)

	return Entry{b.B32.Read(r), b.U64.Read(r), b.B32.Read(r), readPayload(r), b.B16.Read(r)}
}, Write: func(v Entry) []byte {
	return b.Concat(
		b.Header(1),
		b.B32.Write(v.VaultId),
		b.U64.Write(v.Seq),
		b.B32.Write(v.Parent),
		writePayload(v.EntryPayload),
		b.B16.Write(v.Signer),
	)
}}
