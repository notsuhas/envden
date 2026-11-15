package pairing

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type PairApprover struct {
	VaultId      []byte
	ServerPin    []byte
	ManifestHash []byte
}

var PairApproverCodec = b.NewCodec(func(r *b.Reader) PairApprover {
	b.Tagged(8, r)

	return PairApprover{VaultId: b.B32.Read(r), ServerPin: b.B32.Read(r), ManifestHash: b.B32.Read(r)}
}, func(v PairApprover) []byte {
	return b.Concat(b.Header(8), b.B32.Write(v.VaultId), b.B32.Write(v.ServerPin), b.B32.Write(v.ManifestHash))
}, nil)
