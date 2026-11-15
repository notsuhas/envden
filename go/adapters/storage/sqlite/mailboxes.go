package sqlite

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
)

func (s *storage) openMailbox(v, id []byte, now int64) (*adapters.StoredMailbox, error) {
	var out *adapters.StoredMailbox
	if err := s.tx(func() error {
		_, err := s.run("DELETE FROM mailboxes WHERE expires<=?", now)
		if err != nil {
			return err
		}

		_, err = s.run("DELETE FROM openings WHERE at<=?", now-3600000)
		if err != nil {
			return err
		}

		countResult, err := s.count("SELECT COUNT(*) FROM openings WHERE vault=?", v)
		if err != nil {
			return err
		}
		if countResult >=
			10 {
			return nil
		}
		used := map[int]bool{}
		r, err := s.rows("SELECT number FROM mailboxes")
		if err != nil {
			return err
		}

		defer func() { _ = r.Close() }()
		for r.Next() {
			var n int
			if err := r.Scan(&n); err != nil {
				return err
			}

			used[n] = true
		}
		if err := r.Close(); err != nil {
			return err
		}

		n := 1
		for used[n] && n <= 999 {
			n++
		}
		if n > 999 {
			return nil
		}
		_, err = s.run("INSERT INTO mailboxes VALUES(?,?,?,?)", n, v, id, now+600000)
		if err != nil {
			return err
		}

		_, err = s.run("INSERT INTO openings VALUES(?,?)", v, now)
		if err != nil {
			return err
		}

		out = &adapters.StoredMailbox{Number: n, Device: id, ExpiresAt: now + 600000, Slots: map[adapters.MailboxSlot][]byte{}}

		return nil
	}); err != nil {
		return nil, err
	}

	return out, nil
}

func (s *storage) mailbox(v []byte, n int, now int64) (*adapters.StoredMailbox, error) {
	r, err := s.rows("SELECT device,CAST(expires AS INTEGER) FROM mailboxes WHERE vault=? AND number=? AND expires>?", v, n, now)
	if err != nil {
		return nil, err
	}

	defer func() { _ = r.Close() }()
	out := &adapters.StoredMailbox{Number: n, Slots: map[adapters.MailboxSlot][]byte{}}
	found := r.Next()
	if found {
		if err := r.Scan(&out.Device, &out.ExpiresAt); err != nil {
			return nil, err
		}
	}
	if err := r.Close(); err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	for _, slot := range []adapters.MailboxSlot{"KE1", "KE2", "KE3", "PairJoiner"} {
		b, err := s.bytes("SELECT bytes FROM slots WHERE number=? AND slot=?", n, slot)
		if err != nil {
			return nil, err
		}
		if b != nil {
			out.Slots[slot] = b
		}
	}

	return out, nil
}

func (s *storage) writeMailbox(v []byte, n int, slot adapters.MailboxSlot, b []byte, now int64) (adapters.MailboxWrite, error) {
	var result adapters.MailboxWrite
	if err := s.tx(func() error {
		box, err := s.mailbox(v, n, now)
		if err != nil {
			return err
		}
		if box == nil {
			result = "closed"

			return nil
		}
		prior := box.Slots[slot]
		if prior != nil && bytes.Equal(prior, b) {
			result = "identical"

			return nil
		}
		if prior != nil || len(b) > 4096 {
			if err := s.closeMailbox(v, n); err != nil {
				return err
			}

			result = "closed"

			return nil
		}
		required := map[adapters.MailboxSlot]adapters.MailboxSlot{"KE2": "KE1", "KE3": "KE2", "PairJoiner": "KE3"}[slot]
		if required != "" && box.Slots[required] == nil {
			result = "out-of-order"

			return nil
		}
		_, err = s.run("INSERT INTO slots VALUES(?,?,?)", n, slot, b)
		if err != nil {
			return err
		}

		result = "written"

		return nil
	}); err != nil {
		return "", err
	}

	return result, nil
}

func (s *storage) closeMailbox(v []byte, n int) error {
	_, err := s.run("DELETE FROM mailboxes WHERE vault=? AND number=?", v, n)
	if err != nil {
		return err
	}

	return nil
}
