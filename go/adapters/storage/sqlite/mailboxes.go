package sqlite

import (
	"bytes"
	"github.com/notsuhas/envden/go/core/adapters"
)

func (s *storage) openMailbox(v, id []byte, now int64) *adapters.StoredMailbox {
	var out *adapters.StoredMailbox
	s.tx(func() {
		s.run("DELETE FROM mailboxes WHERE expires<=?", now)
		s.run("DELETE FROM openings WHERE at<=?", now-3600000)
		if s.count("SELECT COUNT(*) FROM openings WHERE vault=?", v) >= 10 {
			return
		}
		used := map[int]bool{}
		r := s.rows("SELECT number FROM mailboxes")
		defer r.Close()
		for r.Next() {
			var n int
			must(r.Scan(&n))
			used[n] = true
		}
		must(r.Close())
		n := 1
		for used[n] && n <= 999 {
			n++
		}
		if n > 999 {
			return
		}
		s.run("INSERT INTO mailboxes VALUES(?,?,?,?)", n, v, id, now+600000)
		s.run("INSERT INTO openings VALUES(?,?)", v, now)
		out = &adapters.StoredMailbox{Number: n, Device: id, ExpiresAt: now + 600000, Slots: map[adapters.MailboxSlot][]byte{}}
	})
	return out
}

func (s *storage) mailbox(v []byte, n int, now int64) *adapters.StoredMailbox {
	r := s.rows("SELECT device,CAST(expires AS INTEGER) FROM mailboxes WHERE vault=? AND number=? AND expires>?", v, n, now)
	defer r.Close()
	out := &adapters.StoredMailbox{Number: n, Slots: map[adapters.MailboxSlot][]byte{}}
	found := r.Next()
	if found {
		must(r.Scan(&out.Device, &out.ExpiresAt))
	}
	must(r.Close())
	if !found {
		return nil
	}
	for _, slot := range []adapters.MailboxSlot{"KE1", "KE2", "KE3", "PairJoiner"} {
		b := s.bytes("SELECT bytes FROM slots WHERE number=? AND slot=?", n, slot)
		if b != nil {
			out.Slots[slot] = b
		}
	}
	return out
}

func (s *storage) writeMailbox(v []byte, n int, slot adapters.MailboxSlot, b []byte, now int64) adapters.MailboxWrite {
	var result adapters.MailboxWrite
	s.tx(func() {
		box := s.mailbox(v, n, now)
		if box == nil {
			result = "closed"
			return
		}
		prior := box.Slots[slot]
		if prior != nil && bytes.Equal(prior, b) {
			result = "identical"
			return
		}
		if prior != nil || len(b) > 4096 {
			s.closeMailbox(v, n)
			result = "closed"
			return
		}
		required := map[adapters.MailboxSlot]adapters.MailboxSlot{"KE2": "KE1", "KE3": "KE2", "PairJoiner": "KE3"}[slot]
		if required != "" && box.Slots[required] == nil {
			result = "out-of-order"
			return
		}
		s.run("INSERT INTO slots VALUES(?,?,?)", n, slot, b)
		result = "written"
	})
	return result
}

func (s *storage) closeMailbox(v []byte, n int) {
	s.run("DELETE FROM mailboxes WHERE vault=? AND number=?", v, n)
}
