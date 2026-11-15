package pairing

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type PairApprover struct {
	VaultId      []byte
	ServerPin    []byte
	ManifestHash []byte
}

var PairApproverCodec = encoding.NewCodec(func(r *encoding.Reader) PairApprover {
	encoding.Tagged(8, r)

	return PairApprover{VaultId: encoding.B32.Read(r), ServerPin: encoding.B32.Read(r), ManifestHash: encoding.B32.Read(r)}
}, func(v PairApprover) []byte {
	return encoding.Concat(encoding.Header(8), encoding.B32.Write(v.VaultId), encoding.B32.Write(v.ServerPin), encoding.B32.Write(v.ManifestHash))
}, nil)
