package objects

import (
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Member struct{ Id, ObjPub []byte }

func VerifyRawObject(raw []byte, members []Member, label string) crypto.Verification[bool] {
	if len(raw) < 82 {
		return crypto.Verification[bool]{Reason: "Truncated signed object"}
	}
	signer := raw[len(raw)-80 : len(raw)-64]
	for _, m := range members {
		if encoding.Equal(m.Id, signer) {
			return crypto.Verify(m.ObjPub, label, raw[:len(raw)-64], raw[len(raw)-64:])
		}
	}

	return crypto.Verification[bool]{Reason: "Unknown signer"}
}
