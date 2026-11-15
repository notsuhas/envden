package memory

import (
	"sort"

	"github.com/notsuhas/envden/go/core/adapters"
)

func rowsRange(rows []adapters.StoredHeader, from, to uint64, limit, maxBytes int) []adapters.StoredHeader {
	selected := []adapters.StoredHeader{}
	for _, row := range rows {
		if row.Seq >= from && row.Seq <= to {
			selected = append(selected, clone(row))
		}
	}
	sort.SliceStable(selected, func(i, j int) bool { return selected[i].Seq < selected[j].Seq })
	if limit > 0 && limit < len(selected) {
		selected = selected[:limit]
	}
	out := []adapters.StoredHeader{}
	size := 0
	for i, row := range selected {
		size += len(row.Bytes)
		if maxBytes == 0 || size <= maxBytes || i == 0 {
			out = append(out, row)
		}
	}

	return out
}

func (m *memory) headers(v []byte, from, to uint64, limit, maxBytes int) []adapters.StoredHeader {
	return rowsRange(m.data.Headers[hexKey(v)], from, to, limit, maxBytes)
}

func (m *memory) entries(v []byte, from, to uint64, limit, maxBytes int) []adapters.StoredHeader {
	return rowsRange(m.data.Entries[hexKey(v)], from, to, limit, maxBytes)
}

func (m *memory) header(v, h []byte) *adapters.StoredHeader {
	for _, row := range m.data.Headers[hexKey(v)] {
		if same(row.Hash, h) {
			out := clone(row)

			return &out
		}
	}

	return nil
}

func (m *memory) fileList(v, h []byte) []byte { return clone(m.data.Lists[pair(v, h)].Files.Bytes) }

func (m *memory) commitSwap(v, expected []byte, swap adapters.StoredSwap, now int64) adapters.CommitResult {
	var result adapters.CommitResult
	m.tx(func() {
		key := hexKey(v)
		digest := pair(v, swap.BodyDigest)
		if m.data.Digests[digest] {
			result.Kind = adapters.RetryOfCommitted

			return
		}
		head := m.head(v)
		if !same(head, expected) {
			result = adapters.CommitResult{Kind: adapters.HeadMovedResult, Head: head}

			return
		}
		must(adapters.PrepareCommit(m, v, swap, now))
		headers := m.data.Headers[key]
		for _, h := range headers {
			if h.Seq == swap.Header.Seq || same(h.Hash, swap.Header.Hash) {
				fail("Duplicate header")
			}
		}
		if swap.Header.Seq > 9007199254740991 {
			fail("Invalid sequence")
		}
		if swap.Files != nil {
			listKey := pair(v, swap.Files.Hash)
			prior := m.data.Lists[listKey]
			m.data.Lists[listKey] = list{key, clone(*swap.Files), now, prior.Permanent || swap.Files.RetainForever}
			if swap.Files.RetainForever {
				current := m.data.CurrentFiles[key]
				previous, ok := m.data.Lists[current]
				if ok {
					previous.Permanent = true
					m.data.Lists[current] = previous
				}
			}
			m.data.CurrentFiles[key] = listKey
		}
		current := m.data.CurrentFiles[key]
		l, ok := m.data.Lists[current]
		if ok {
			l.At = now
			m.data.Lists[current] = l
		}
		m.data.Headers[key] = append(headers, clone(swap.Header))
		entries := m.data.Entries[key]
		for _, entry := range swap.Entries {
			for _, prior := range entries {
				if prior.Seq == entry.Seq || same(prior.Hash, entry.Hash) {
					fail("Duplicate entry")
				}
			}
			entries = append(entries, clone(entry))
		}
		m.data.Entries[key] = entries
		must(adapters.WriteCommitState(m, v, swap))
		if swap.Approver != nil {
			m.data.Approvers[pair(v, swap.Approver.Device)] = timed{clone(swap.Approver.Bytes), now + 86400000}
		}
		if swap.ClearRepairReports {
			for k, s := range m.data.States {
				if s.Vault == key && s.Kind == adapters.StateRepairReport {
					delete(m.data.States, k)
					m.forget("states", k)
				}
			}
		}
		if swap.CloseMailbox != nil {
			m.closeMailbox(v, *swap.CloseMailbox)
		}
		if swap.SetupTokenHash != nil {
			m.data.Setup = nil
		}
		m.data.Digests[digest] = true
		m.data.Heads[key] = clone(swap.Header.Hash)
		result.Kind = adapters.Committed
	})

	return result
}
