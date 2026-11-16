package enginetest

import (
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"path/filepath"
	"strings"
)

func (m *exploration) checkPull(d int, result syncer.Result, records int, active []value) {
	if result.Conflicts > 0 || records > 0 {
		if !m.dirty[d] {
			m.bad("spurious-conflict", "Clean device entered conflict")
		}
		return
	}
	if m.dirty[d] {
		desired := m.last[d]
		if desired == deleted {
			desired = value{}
		}
		if !contains(active, desired) {
			m.bad("I7-pull-undid-action", "Most recent explicit action disappeared without conflict")
		}
		if m.last[d] == deleted && !allEqual(active, value{}) {
			m.bad("I7-pull-undid-removal", "Removal was undone without conflict")
		}
		if allEqual(active, m.head()) {
			m.clean(d, m.head())
		}
	} else if !allEqual(active, m.head()) {
		m.bad("I2-pull-not-converged", "Clean device differs from server")
	} else {
		m.clean(d, m.head())
	}
}
func (m *exploration) checkPush(d int, now value, result *syncer.Result, reports []string) {
	records := m.conflictCount(d)
	active := m.places(d, true)
	head := m.head()
	if (records > 0 || result != nil && result.Conflicts > 0) && !m.dirty[d] {
		m.bad("spurious-conflict", "Clean device entered conflict")
	}
	desired := m.last[d]
	if desired == deleted {
		desired = value{}
	}
	if m.dirty[d] && records == 0 && !contains(active, desired) {
		m.bad("I7-push-undid-action", "Most recent explicit action disappeared without conflict")
	}
	if now != head && contains(m.commits, now) && head != m.commits[m.intentSeen[d]] {
		for i, author := range m.authors {
			if author != d && author != -1 && i > m.intentSeen[d] {
				m.bad("I1-ancestor-without-observation", "Replaced a newer unseen commit with ancestor bytes")
				break
			}
		}
	}
	if now != head {
		intended := now
		if !now.present {
			intended = deleted
		}
		if !m.dirty[d] || !m.pending[d][intended] {
			kind := "I1-unintended-push"
			if !now.present {
				kind = "I5-tombstone"
			}
			m.bad(kind, "Commit has no user intent")
		}
		if m.pending[d][intended] && intended != m.last[d] && len(m.targets[d]) == 1 {
			m.bad("I1-discarded-value-pushed", "An earlier discarded edit was pushed")
		}
		m.commits = append(m.commits, now)
		m.authors = append(m.authors, d)
		if !now.present {
			m.tombstoned = true
		}
		if intended == m.last[d] || !m.dirty[d] {
			m.clean(d, now)
		}
		skipped := false
		for _, report := range reports {
			if strings.Contains(report, "checkout needs approval") {
				skipped = true
			}
		}
		if result != nil && result.Conflicts == 0 && !skipped && !allEqual(active, now) {
			m.bad("P2-push-local-differs", "Approved places differ after successful push")
		}
	} else if result != nil && result.Conflicts == 0 && records == 0 {
		held := false
		for _, report := range reports {
			for _, target := range m.targets[d] {
				if strings.HasPrefix(report, "Held back "+filepath.Join(target.Root, target.Path)+":") {
					held = true
				}
			}
		}
		if !held {
			if m.dirty[d] && desired != now {
				m.bad("P1-push-dropped-user-op", "Push dropped explicit intent")
			} else if !m.dirty[d] && !allEqual(active, now) {
				m.bad("I2-push-not-converged", "Clean device differs from server")
			}
		}
		if allEqual(active, now) {
			m.clean(d, now)
		}
	}
	m.seen[d] = len(m.commits) - 1
}
func (m *exploration) close() {
	for _, restore := range m.restores {
		restore()
	}
	clear(m.restores)
	clear(m.skipped)
	m.resumeSkipped()
	m.step = 99
	settle := func() int {
		for d := 0; d < 2; d++ {
			if m.dirty[d] {
				m.doPush(d, "")
			}
			m.survive()
		}
		conflicts := 0
		for d := 0; d < 2; d++ {
			r := m.doPull(d, -1, false)
			m.survive()
			if r == nil {
				conflicts++
			} else {
				conflicts += r.Conflicts
			}
			conflicts += m.conflictCount(d)
		}
		return conflicts
	}
	conflicts := settle()
	for _, choice := range []string{"keep-mine", "take-server", "take-server"} {
		if conflicts == 0 {
			break
		}
		for d := 0; d < 2; d++ {
			selected := choice
			if len(m.pending[d]) == 0 {
				selected = "take-server"
			}
			m.doResolve(d, selected)
			m.survive()
		}
		conflicts = settle()
	}
	if conflicts > 0 {
		m.bad("I6-BLOCKED", "still conflicts after resolve rounds")
	} else if !allEqual(append(m.places(0, true), m.places(1, true)...), m.head()) {
		m.bad("I2-final", "Conflict-free devices differ from server")
	}
}
