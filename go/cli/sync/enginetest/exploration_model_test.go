package enginetest

import (
	"fmt"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
)

var deleted = value{"\x00DEL", true}

type deferredEdit struct {
	device int
	v      value
}

type exploration struct {
	f                        *fixture
	devices                  [2]*contracts.Adapters
	targets                  [2][]state.Link
	stores                   [2]string
	commits                  []value
	authors                  []int
	seen, intentSeen         [2]int
	dirty, corrupt           [2]bool
	pending                  [2]map[value]bool
	pendingOrder             [2][]value
	last, agreed             [2]value
	observed                 [2][]value
	required, saved          map[string]bool
	skipped, untracked       map[string]bool
	deferred                 map[string]deferredEdit
	restores                 map[int]func()
	notes, violations, trace []string
	unique, step             int
	token                    string
	tombstoned               bool
}

func newExploration(f *fixture, targets []state.Link) *exploration {
	m := &exploration{f: f, devices: [2]*contracts.Adapters{&f.first, &f.second}, targets: [2][]state.Link{{{Root: f.checkout.Root, Path: ".env", Store: f.aStore, Mode: "link"}}, targets}, stores: [2]string{f.aStore, targets[0].Store}, commits: []value{{original, true}}, authors: []int{-1}, required: map[string]bool{}, saved: map[string]bool{}, skipped: map[string]bool{}, untracked: map[string]bool{}, deferred: map[string]deferredEdit{}, restores: map[int]func(){}}

	for d := 0; d < 2; d++ {
		m.pending[d] = map[value]bool{}
		m.agreed[d] = value{original, true}
		m.observed[d] = make([]value, len(m.targets[d])+1)

		for i := range m.observed[d] {
			m.observed[d][i] = value{original, true}
		}
	}

	return m
}

func (m *exploration) bad(kind, detail string) {
	m.violations = append(m.violations, fmt.Sprintf("%d:%s %s: %s", m.step, m.token, kind, detail))
}

func (m *exploration) clean(d int, v value) {
	if m.corrupt[d] {
		return
	}

	m.agreed[d] = v
	m.seen[d] = -1

	for i := range m.commits {
		if m.commits[i] == v {
			m.seen[d] = i
		}
	}

	m.dirty[d] = false
	clear(m.pending[d])
	m.pendingOrder[d] = nil
	m.last[d] = value{}
}

func (m *exploration) head() value { return m.commits[len(m.commits)-1] }

func (m *exploration) places(d int, active bool) []value {
	values := []value{readValue(m.stores[d])}

	for _, target := range m.targets[d] {
		if active && (m.skipped[target.Root] || m.untracked[target.Root]) {
			continue
		}

		values = append(values, readValue(filepath.Join(target.Root, target.Path)))
	}

	return values
}

func contains(values []value, v value) bool {
	for _, item := range values {
		if item == v {
			return true
		}
	}

	return false
}

func allEqual(values []value, v value) bool {
	for _, item := range values {
		if item != v {
			return false
		}
	}

	return true
}

func (m *exploration) conflictCount(d int) int {
	records, err := local.ConflictRecords(m.devices[d].Home)
	must(m.f.t, err)
	count := 0

	for _, r := range records {
		if r.Store == m.stores[d] {
			count++
		}
	}

	return count
}

func (m *exploration) absorb(reports []string) {
	for _, report := range reports {
		if match := savedReport.FindStringSubmatch(report); len(match) > 1 {
			m.saved[match[1]] = true
		}
	}
}

func (m *exploration) survive() {
	if len(m.required) == 0 {
		return
	}

	reachable := map[value]bool{}

	for d := 0; d < 2; d++ {
		for _, v := range m.places(d, false) {
			reachable[v] = true
		}

		records, err := local.ConflictRecords(m.devices[d].Home)
		must(m.f.t, err)

		for _, r := range records {
			for _, path := range r.Alternatives {
				reachable[readValue(path)] = true
			}
		}
	}

	for path := range m.saved {
		reachable[readValue(path)] = true
	}

	for _, v := range m.commits {
		reachable[v] = true
	}

	for v := range m.required {
		if !reachable[value{v, true}] {
			m.bad("I3-LOST", "edit "+v+" not in any place or printed path")
			delete(m.required, v)
		}
	}
}
