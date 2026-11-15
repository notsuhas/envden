package memory

import "github.com/notsuhas/envden/go/core/adapters"

func (m *memory) openMailbox(v, id []byte, now int64) *adapters.StoredMailbox {
	for n, b := range m.data.Mailboxes {
		if b.Box.ExpiresAt <= now {
			delete(m.data.Mailboxes, n)
		}
	}
	key := hexKey(v)
	openings := []int64{}
	for _, at := range m.data.Openings[key] {
		if at > now-3600000 {
			openings = append(openings, at)
		}
	}
	m.data.Openings[key] = openings
	if len(openings) >= 10 {
		return nil
	}
	n := 1
	for n <= 999 {
		if _, ok := m.data.Mailboxes[n]; !ok {
			break
		}
		n++
	}
	if n > 999 {
		return nil
	}
	b := adapters.StoredMailbox{Number: n, Device: clone(id), ExpiresAt: now + 600000, Slots: map[adapters.MailboxSlot][]byte{}}
	m.data.Mailboxes[n] = box{key, b}
	m.data.Openings[key] = append(openings, now)
	out := clone(b)
	return &out
}

func (m *memory) mailbox(v []byte, n int, now int64) *adapters.StoredMailbox {
	b, ok := m.data.Mailboxes[n]
	if ok && b.Vault == hexKey(v) && b.Box.ExpiresAt > now {
		out := clone(b.Box)
		return &out
	}
	return nil
}

func (m *memory) closeMailbox(v []byte, n int) {
	if b, ok := m.data.Mailboxes[n]; ok && b.Vault == hexKey(v) {
		delete(m.data.Mailboxes, n)
	}
}

func (m *memory) writeMailbox(v []byte, n int, slot adapters.MailboxSlot, b []byte, now int64) adapters.MailboxWrite {
	box := m.mailbox(v, n, now)
	if box == nil {
		return "closed"
	}
	prior := box.Slots[slot]
	if prior != nil && same(prior, b) {
		return "identical"
	}
	if prior != nil || len(b) > 4096 {
		m.closeMailbox(v, n)
		return "closed"
	}
	required := map[adapters.MailboxSlot]adapters.MailboxSlot{"KE2": "KE1", "KE3": "KE2", "PairJoiner": "KE3"}[slot]
	if required != "" && box.Slots[required] == nil {
		return "out-of-order"
	}
	entry := m.data.Mailboxes[n]
	entry.Box.Slots[slot] = clone(b)
	m.data.Mailboxes[n] = entry
	return "written"
}
