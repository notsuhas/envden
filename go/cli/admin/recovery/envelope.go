package recovery

import (
	"github.com/notsuhas/envden/go/cli/admin/shared"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func SealRecoveryEnvelope(c *shared.Context, h shared.History, k keys.RecoveryKeys, password string, secret []byte, now func() int64) ([]byte, error) {
	return envelope.SealEnvelope(d.Envelope{VaultId: c.VaultID, RecoveryEncSk: k.EncSk, RecoveryObjSk: k.ObjSk, Checkpoint: shared.HeaderHash(h.Headers[len(h.Headers)-1]), SealedAt: uint64(now())}, password, secret)
}
