package sqlite

import (
	"bytes"
	"database/sql"
	"errors"

	"github.com/notsuhas/envden/go/core/adapters"
	envErrors "github.com/notsuhas/envden/go/core/errors"
)

func (s *storage) vaultIDs() ([][]byte, error) {
	r, err := s.rows("SELECT id FROM vaults ORDER BY id")
	if err != nil {
		return nil, err
	}

	defer func() { _ = r.Close() }()
	out := [][]byte{}
	for r.Next() {
		var b []byte
		if err := r.Scan(&b); err != nil {
			return nil, err
		}

		out = append(out, b)
	}
	if err := r.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (s *storage) capUnlocks(v []byte, until int64) error {
	_, err := s.run("UPDATE devices SET unlocked=MIN(unlocked,?) WHERE vault=?", until, v)
	if err != nil {
		return err
	}

	return nil
}

func (s *storage) hasVault(v []byte) (bool, error) {
	vaultResult, err := s.vault(v)
	if err != nil {
		return false, err
	}

	return vaultResult != nil, nil
}

func (s *storage) vault(v []byte) (*adapters.StoredVault, error) {
	var active, frozen, refused int
	var moved, repair, restored, progress []byte
	var period sql.NullFloat64
	e := s.conn.QueryRowContext(bg, "SELECT active,frozen,moved,refused,period,repair,restored,progress FROM vaults WHERE id=?", v).Scan(&active, &frozen, &moved, &refused, &period, &repair, &restored, &progress)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, nil
	}
	if err := e; err != nil {
		return nil, err
	}

	out := &adapters.StoredVault{Active: active != 0, Frozen: frozen != 0, SKRefused: refused != 0, ServerMoved: moved}
	if period.Valid {
		n := int64(period.Float64)
		out.UnlockPeriod = &n
	}
	if repair != nil && restored != nil {
		out.Restored = &adapters.StoredRestored{RepairTokenHash: repair, RestoredHead: restored, FinishProgress: progress}
	}

	return out, nil
}

func (s *storage) configureVault(v []byte, state adapters.StoredVault, writes []adapters.StateWrite, token []byte) error {
	return s.tx(func() error {
		tokenChanged := token != nil
		if tokenChanged {
			requiresSetupToken, err := s.hasVault(v)
			if err != nil {
				return err
			}
			if !requiresSetupToken {
				setupTokenResult, err := s.setupToken()
				if err != nil {
					return err
				}
				requiresSetupToken = !bytes.Equal(setupTokenResult, token)
			}
			tokenChanged = (requiresSetupToken)
		}
		if tokenChanged {
			return storageFailure("Setup token changed, consumed, or vault exists")
		}
		if len(v) == 32 && bytes.Equal(v, make([]byte, 32)) {
			return envErrors.New("INVALID_INPUT", "Invalid vault ID")
		}
		var period any
		if state.UnlockPeriod != nil {
			period = *state.UnlockPeriod
		}
		var repair, restored, progress []byte
		if state.Restored != nil {
			repair = state.Restored.RepairTokenHash
			restored = state.Restored.RestoredHead
			progress = state.Restored.FinishProgress
		}
		_, err := s.run(`INSERT INTO vaults(id,active,frozen,moved,refused,period,repair,restored,progress) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,frozen=excluded.frozen,moved=excluded.moved,refused=excluded.refused,period=excluded.period,repair=excluded.repair,restored=excluded.restored,progress=excluded.progress`, v, bit(state.Active), bit(state.Frozen), optional(state.ServerMoved), bit(state.SKRefused), period, optional(repair), optional(restored), optional(progress))
		if err != nil {
			return err
		}
		if err := s.writeState(v, writes); err != nil {
			return err
		}
		if token != nil {
			_, err := s.run("DELETE FROM setup")
			if err != nil {
				return err
			}
		}

		return nil
	})
}

func (s *storage) head(v []byte) ([]byte, error) {
	return s.bytes("SELECT head AS bytes FROM vaults WHERE id=? AND head IS NOT NULL", v)
}

func (s *storage) discardInactiveVault(v []byte) error {
	if err := s.tx(func() error {
		state, err := s.vault(v)
		if err != nil {
			return err
		}
		if state != nil && state.Active {
			return storageFailure("Cannot discard an active vault")
		}
		_, err = s.run("INSERT OR IGNORE INTO blob_garbage SELECT vault,hash FROM blobs WHERE vault=?", v)
		if err != nil {
			return err
		}

		for _, table := range []string{"headers", "entries", "lists", "state", "devices", "digests", "blobs", "blob_usage", "sessions", "approvers", "mailboxes", "openings"} {
			_, err := s.run("DELETE FROM "+table+" WHERE vault=?", v)
			if err != nil {
				return err
			}
		}
		_, err = s.run("DELETE FROM vaults WHERE id=?", v)
		if err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	return s.collectGarbage()
}
