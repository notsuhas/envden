package sqlite

import (
	"bytes"
	"database/sql"
	"errors"
	"github.com/notsuhas/envden/go/core/adapters"
	envErrors "github.com/notsuhas/envden/go/core/errors"
)

func (s *storage) vaultIDs() [][]byte {
	r := s.rows("SELECT id FROM vaults ORDER BY id")
	defer r.Close()
	out := [][]byte{}
	for r.Next() {
		var b []byte
		must(r.Scan(&b))
		out = append(out, b)
	}
	must(r.Err())
	return out
}

func (s *storage) capUnlocks(v []byte, until int64) {
	s.run("UPDATE devices SET unlocked=MIN(unlocked,?) WHERE vault=?", until, v)
}

func (s *storage) hasVault(v []byte) bool { return s.vault(v) != nil }

func (s *storage) vault(v []byte) *adapters.StoredVault {
	var active, frozen, refused int
	var moved, repair, restored, progress []byte
	var period sql.NullFloat64
	e := s.conn.QueryRowContext(bg, "SELECT active,frozen,moved,refused,period,repair,restored,progress FROM vaults WHERE id=?", v).Scan(&active, &frozen, &moved, &refused, &period, &repair, &restored, &progress)
	if errors.Is(e, sql.ErrNoRows) {
		return nil
	}
	must(e)
	out := &adapters.StoredVault{Active: active != 0, Frozen: frozen != 0, SKRefused: refused != 0, ServerMoved: moved}
	if period.Valid {
		n := int64(period.Float64)
		out.UnlockPeriod = &n
	}
	if repair != nil && restored != nil {
		out.Restored = &adapters.StoredRestored{RepairTokenHash: repair, RestoredHead: restored, FinishProgress: progress}
	}
	return out
}

func (s *storage) configureVault(v []byte, state adapters.StoredVault, writes []adapters.StateWrite, token []byte) {
	s.tx(func() {
		if token != nil && (s.hasVault(v) || !bytes.Equal(s.setupToken(), token)) {
			panic(errors.New("Setup token changed, consumed, or vault exists"))
		}
		if len(v) == 32 && bytes.Equal(v, make([]byte, 32)) {
			panic(envErrors.New("INVALID_INPUT", "Invalid vault ID"))
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
		s.run(`INSERT INTO vaults(id,active,frozen,moved,refused,period,repair,restored,progress) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,frozen=excluded.frozen,moved=excluded.moved,refused=excluded.refused,period=excluded.period,repair=excluded.repair,restored=excluded.restored,progress=excluded.progress`, v, bit(state.Active), bit(state.Frozen), optional(state.ServerMoved), bit(state.SKRefused), period, optional(repair), optional(restored), optional(progress))
		s.writeState(v, writes)
		if token != nil {
			s.run("DELETE FROM setup")
		}
	})
}

func (s *storage) head(v []byte) []byte {
	return s.bytes("SELECT head AS bytes FROM vaults WHERE id=? AND head IS NOT NULL", v)
}

func (s *storage) discardInactiveVault(v []byte) {
	s.tx(func() {
		state := s.vault(v)
		if state != nil && state.Active {
			panic(errors.New("Cannot discard an active vault"))
		}
		s.run("INSERT OR IGNORE INTO blob_garbage SELECT vault,hash FROM blobs WHERE vault=?", v)
		for _, table := range []string{"headers", "entries", "lists", "state", "devices", "digests", "blobs", "blob_usage", "sessions", "approvers", "mailboxes", "openings"} {
			s.run("DELETE FROM "+table+" WHERE vault=?", v)
		}
		s.run("DELETE FROM vaults WHERE id=?", v)
	})
	s.collectGarbage()
}

func (s *storage) state(v []byte, k adapters.StateKind, key []byte) []byte {
	return s.bytes("SELECT bytes FROM state WHERE vault=? AND kind=? AND key=?", v, k, key)
}

func (s *storage) states(v []byte, k adapters.StateKind) []adapters.StateEntry {
	r := s.rows("SELECT key,bytes FROM state WHERE vault=? AND kind=? ORDER BY key", v, k)
	defer r.Close()
	out := []adapters.StateEntry{}
	for r.Next() {
		var row adapters.StateEntry
		must(r.Scan(&row.Key, &row.Bytes))
		out = append(out, row)
	}
	must(r.Err())
	return out
}

func (s *storage) writeState(v []byte, writes []adapters.StateWrite) {
	s.tx(func() {
		for _, w := range writes {
			if w.Bytes == nil {
				s.run("DELETE FROM state WHERE vault=? AND kind=? AND key=?", v, w.Kind, w.Key)
			} else {
				s.run("INSERT OR REPLACE INTO state VALUES(?,?,?,?)", v, w.Kind, w.Key, w.Bytes)
			}
		}
	})
}

func (s *storage) setupToken() []byte { return s.bytes("SELECT bytes FROM setup WHERE singleton=1") }

func (s *storage) setSetupToken(b []byte) { s.run("INSERT OR REPLACE INTO setup VALUES(1,?)", b) }

func (s *storage) device(v, id []byte) *adapters.StoredDevice {
	var row adapters.StoredDevice
	e := s.conn.QueryRowContext(bg, "SELECT CAST(unlocked AS INTEGER),CAST(fresh AS INTEGER),version,grant FROM devices WHERE vault=? AND id=?", v, id).Scan(&row.UnlockedUntil, &row.FreshUntil, &row.ClientVersion, &row.MailboxGrant)
	if errors.Is(e, sql.ErrNoRows) {
		return nil
	}
	must(e)
	return &row
}

func (s *storage) putDevice(v, id []byte, state adapters.StoredDevice) {
	s.run("INSERT OR REPLACE INTO devices VALUES(?,?,?,?,?,?)", v, id, state.UnlockedUntil, state.FreshUntil, state.ClientVersion, optional(state.MailboxGrant))
}
