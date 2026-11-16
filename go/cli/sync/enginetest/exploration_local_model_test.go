package enginetest

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (m *exploration) recordEdit(d int, next, before value) {
	if before.present {
		delete(m.required, before.text)
	}

	m.required[next.text] = true
	m.intentSeen[d] = m.seen[d]
	m.dirty[d] = true
	m.addPending(d, next)
	m.last[d] = next
}

func (m *exploration) recordPlaceEdit(d, index int, next, before value) {
	root := m.targets[d][index].Root

	if m.skipped[root] || m.untracked[root] {
		if before.present {
			delete(m.required, before.text)
		}

		m.required[next.text] = true
		m.deferred[root] = deferredEdit{d, next}
	} else {
		m.recordEdit(d, next, before)
	}
}

func (m *exploration) placePath(d, index int) string {
	target := m.targets[d][index]
	path := filepath.Join(target.Root, target.Path)
	info, err := os.Lstat(path)
	if err == nil && info.Mode()&os.ModeSymlink != 0 {
		return target.Store
	}

	return path
}

func (m *exploration) settleUnobserved(d, index int) {
	slot := index + 1

	if m.placePath(d, index) == m.stores[d] {
		slot = 0
	}

	if m.observed[d][slot] == m.agreed[d] && allEqual(m.places(d, false), m.agreed[d]) {
		m.clean(d, m.agreed[d])
	}
}

func (m *exploration) write(d, index int, next value) {
	path := m.placePath(d, index)
	before := readValue(path)

	if before == next {
		return
	}

	m.recordPlaceEdit(d, index, next, before)
	m.f.write(path, next.text)
	m.settleUnobserved(d, index)
}

func (m *exploration) observe(d int) {
	current := m.places(d, false)
	m.observed[d][0] = current[0]

	for i, target := range m.targets[d] {
		if !m.skipped[target.Root] && !m.untracked[target.Root] {
			m.observed[d][i+1] = current[i+1]
		}
	}
}

func (m *exploration) resumeSkipped() {
	for root, edit := range m.deferred {
		if !m.skipped[root] && !m.untracked[root] {
			m.recordEdit(edit.device, edit.v, value{})
			delete(m.deferred, root)
		}
	}
}

func (m *exploration) checkCorrupt(d int, reports []string) {
	if !m.corrupt[d] {
		return
	}

	m.corrupt[d] = false

	for _, report := range reports {
		if strings.HasPrefix(report, "Invalid sync state") {
			return
		}
	}

	m.bad("corrupt-state-ignored", "Corrupt receipt was silently ignored")
}

func (m *exploration) note(err error, kind string) {
	if err != nil {
		m.notes = append(m.notes, fmt.Sprintf("%d:%s %s: %v", m.step, m.token, kind, err))
	}
}

func (m *exploration) addPending(d int, v value) {
	if !m.pending[d][v] {
		m.pendingOrder[d] = append(m.pendingOrder[d], v)
	}

	m.pending[d][v] = true
}
