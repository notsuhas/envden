package recovery

import (
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/keys"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

func RecoveryEpochKey(history vault.History, envelope content.Envelope, encSk, vaultID []byte) ([]byte, error) {
	zero := true
	for _, v := range envelope.Checkpoint {
		if v != 0 {
			zero = false
		}
	}

	if !zero && !vault.HistoryHasHeader(history, envelope.Checkpoint) {
		return nil, errors.New(errors.Rollback, "Envelope checkpoint missing from history")
	}

	if len(history.Entries) == 0 || history.Entries[0].Body.Kind != 0 {
		return nil, errors.New(errors.InvalidData, "Missing genesis")
	}

	recovery := history.State.Recovery
	wrap := keys.DeviceWrap(history.Entries, recovery.Id, nil)
	commit := history.State.Commits[history.State.Epoch]
	if wrap == nil || commit == nil {
		return nil, errors.New(errors.InvalidData, "Missing recovery wrap")
	}

	return epochs.OpenWrap(*wrap, encSk, recovery.EncPub, vaultID, history.State.Epoch, commit)
}
