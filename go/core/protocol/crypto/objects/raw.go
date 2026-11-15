package objects

import (
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Member struct{ Id, ObjPub []byte }

func VerifyRawObject(raw []byte, members []Member, label string) c.Verification[bool] {
	if len(raw) < 82 {
		return c.Verification[bool]{Reason: "Truncated signed object"}
	}
	signer := raw[len(raw)-80 : len(raw)-64]
	for _, m := range members {
		if b.Equal(m.Id, signer) {
			return c.Verify(m.ObjPub, label, raw[:len(raw)-64], raw[len(raw)-64:])
		}
	}
	return c.Verification[bool]{Reason: "Unknown signer"}
}
