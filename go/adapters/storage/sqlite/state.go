package sqlite

import (
	"database/sql"
	"errors"

	"github.com/notsuhas/envden/go/core/adapters"
)

func (s *storage) state(v []byte, k adapters.StateKind, key []byte) ([]byte, error) {
	return s.bytes("SELECT bytes FROM state WHERE vault=? AND kind=? AND key=?", v, k, key)
}

func (s *storage) states(v []byte, k adapters.StateKind) ([]adapters.StateEntry, error) {
	r, err := s.rows("SELECT key,bytes FROM state WHERE vault=? AND kind=? ORDER BY key", v, k)
	if err != nil {
		return nil, err
	}

	defer func() { _ = r.Close() }()
	out := []adapters.StateEntry{}
	for r.Next() {
		var row adapters.StateEntry
		if err := r.Scan(&row.Key, &row.Bytes); err != nil {
			return nil, err
		}

		if row.Key == nil {
			row.Key = []byte{}
		}
		if row.Bytes == nil {
			row.Bytes = []byte{}
		}
		out = append(out, row)
	}
	if err := r.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (s *storage) writeState(v []byte, writes []adapters.StateWrite) error {
	return s.tx(func() error {
		for _, w := range writes {
			if w.Bytes == nil {
				_, err := s.run("DELETE FROM state WHERE vault=? AND kind=? AND key=?", v, w.Kind, w.Key)
				if err != nil {
					return err
				}
			} else {
				_, err := s.run("INSERT OR REPLACE INTO state VALUES(?,?,?,?)", v, w.Kind, w.Key, w.Bytes)
				if err != nil {
					return err
				}
			}
		}

		return nil
	})
}

func (s *storage) setupToken() ([]byte, error) {
	return s.bytes("SELECT bytes FROM setup WHERE singleton=1")
}

func (s *storage) setSetupToken(b []byte) error {
	_, err := s.run("INSERT OR REPLACE INTO setup VALUES(1,?)", b)
	if err != nil {
		return err
	}

	return nil
}

func (s *storage) device(v, id []byte) (*adapters.StoredDevice, error) {
	var row adapters.StoredDevice
	e := s.conn.QueryRowContext(bg, "SELECT CAST(unlocked AS INTEGER),CAST(fresh AS INTEGER),version,grant FROM devices WHERE vault=? AND id=?", v, id).Scan(&row.UnlockedUntil, &row.FreshUntil, &row.ClientVersion, &row.MailboxGrant)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, nil
	}
	if err := e; err != nil {
		return nil, err
	}

	return &row, nil
}

func (s *storage) putDevice(v, id []byte, state adapters.StoredDevice) error {
	_, err := s.run("INSERT OR REPLACE INTO devices VALUES(?,?,?,?,?,?)", v, id, state.UnlockedUntil, state.FreshUntil, state.ClientVersion, optional(state.MailboxGrant))
	if err != nil {
		return err
	}

	return nil
}
