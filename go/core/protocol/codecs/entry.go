package codecs

import (
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
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

func readPayload(r *encoding.Reader) EntryPayload {
	kind := encoding.U8.Read(r)
	switch kind {
	case 0:
		return EntryPayload{kind, entrypayloads.GenesisCodec.Read(r)}
	case 1:
		return EntryPayload{kind, entrypayloads.AddDeviceCodec.Read(r)}
	case 2:
		return EntryPayload{kind, entrypayloads.RemoveDeviceCodec.Read(r)}
	case 3:
		return EntryPayload{kind, entrypayloads.NewEpochCodec.Read(r)}
	case 4:
		return EntryPayload{kind, entrypayloads.ReplaceRecoveryCodec.Read(r)}
	case 5:
		return EntryPayload{kind, entrypayloads.ServerMovedCodec.Read(r)}
	case 6:
		return EntryPayload{kind, entrypayloads.RepairDoneCodec.Read(r)}
	case 7:
		return EntryPayload{kind, entrypayloads.RenameDeviceCodec.Read(r)}
	default:
		panic(enverrors.New(enverrors.UpdateRequired, "Unknown entry kind"))
	}
}

func writePayload(v EntryPayload) []byte {
	var data []byte
	switch v.Kind {
	case 0:
		x, ok := v.Payload.(entrypayloads.Genesis)
		encoding.RequireValue(ok)
		data = entrypayloads.GenesisCodec.Write(x)
	case 1:
		x, ok := v.Payload.(entrypayloads.AddDevice)
		encoding.RequireValue(ok)
		data = entrypayloads.AddDeviceCodec.Write(x)
	case 2:
		x, ok := v.Payload.(entrypayloads.RemoveDevice)
		encoding.RequireValue(ok)
		data = entrypayloads.RemoveDeviceCodec.Write(x)
	case 3:
		x, ok := v.Payload.(entrypayloads.NewEpoch)
		encoding.RequireValue(ok)
		data = entrypayloads.NewEpochCodec.Write(x)
	case 4:
		x, ok := v.Payload.(entrypayloads.ReplaceRecovery)
		encoding.RequireValue(ok)
		data = entrypayloads.ReplaceRecoveryCodec.Write(x)
	case 5:
		x, ok := v.Payload.(entrypayloads.ServerMoved)
		encoding.RequireValue(ok)
		data = entrypayloads.ServerMovedCodec.Write(x)
	case 6:
		x, ok := v.Payload.(entrypayloads.RepairDone)
		encoding.RequireValue(ok)
		data = entrypayloads.RepairDoneCodec.Write(x)
	case 7:
		x, ok := v.Payload.(entrypayloads.RenameDevice)
		encoding.RequireValue(ok)
		data = entrypayloads.RenameDeviceCodec.Write(x)
	default:
		panic(enverrors.New(enverrors.UpdateRequired, "Unknown entry kind"))
	}

	return encoding.Concat(encoding.U8.Write(v.Kind), data)
}

var PayloadCodec = encoding.Codec[EntryPayload]{Read: readPayload, Write: writePayload}

var EntryCodec = encoding.Codec[Entry]{Read: func(r *encoding.Reader) Entry {
	encoding.Tagged(1, r)

	return Entry{encoding.B32.Read(r), encoding.U64.Read(r), encoding.B32.Read(r), readPayload(r), encoding.B16.Read(r)}
}, Write: func(v Entry) []byte {
	return encoding.Concat(
		encoding.Header(1),
		encoding.B32.Write(v.VaultId),
		encoding.U64.Write(v.Seq),
		encoding.B32.Write(v.Parent),
		writePayload(v.EntryPayload),
		encoding.B16.Write(v.Signer),
	)
}}
