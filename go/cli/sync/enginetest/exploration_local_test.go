package enginetest

import (
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	e "github.com/notsuhas/envden/go/core/errors"
	"path/filepath"
)

func (m *exploration) doRemove(d int) {
	target := m.targets[d][0]
	reports := []string{}
	result, err := syncer.RemoveFile(m.f.ctx, *m.devices[d], filepath.Join(target.Root, target.Path), syncer.RemoveOptions{Yes: true, Now: clock, Report: func(v string) { reports = append(reports, v) }})
	if err != nil {
		if !e.Is(err, e.NotFound) {
			m.note(err, "rm")
		}
		return
	}
	m.absorb(reports)
	for _, p := range result.Preserved {
		m.saved[p] = true
	}
	if result.Kind != "removed" {
		return
	}
	m.intentSeen[d] = m.seen[d]
	m.dirty[d] = true
	m.addPending(d, deleted)
	m.last[d] = deleted
	m.observe(d)
}
func (m *exploration) doResolve(d int, choice string) {
	result, err := syncer.ResolveConflict(m.f.ctx, *m.devices[d], syncer.ResolveOptions{File: ".env", Choice: choice, Now: clock})
	if err != nil {
		if err.Error() != "Name exactly one conflict file" {
			m.note(err, "resolve")
		}
		return
	}
	for _, p := range result.Preserved {
		m.saved[p] = true
	}
	m.absorb(result.PlacementReports)
	v := m.places(d, false)[0]
	m.intentSeen[d] = m.seen[d]
	if !v.present {
		if !m.pending[d][deleted] && !m.tombstoned {
			m.bad("I5-resolve-deletion", "resolve produced deletion without rm or tombstone")
		}
		m.dirty[d] = true
		m.addPending(d, deleted)
		m.last[d] = deleted
	} else if choice == "take-server" && contains(m.commits, v) {
		m.clean(d, v)
	} else {
		if !m.pending[d][v] {
			m.bad("resolve-unknown-content", "resolve produced "+v.text)
		}
		if v == m.head() {
			m.clean(d, v)
		} else {
			m.dirty[d] = true
			m.addPending(d, v)
			m.last[d] = v
		}
	}
	m.observe(d)
}
func (m *exploration) doRetrack(d int) {
	a := m.devices[d]
	for _, target := range m.targets[d] {
		s := m.f.state(*a)
		var approved *state.Checkout
		for _, c := range s.Approved {
			if c.Root == target.Root {
				approved = &c
				break
			}
		}
		c, err := a.Repo.CheckoutAt(target.Root)
		must(m.f.t, err)
		if approved == nil || c == nil {
			continue
		}
		cancelled, err := checkout.Untrack(m.f.ctx, *a, target.Root)
		must(m.f.t, err)
		if len(cancelled) > 0 && m.last[d] == deleted {
			m.clean(d, m.agreed[d])
		}
		next := m.f.state(*a)
		next.Approved = append(next.Approved, *approved)
		path := filepath.Join(target.Root, ".env")
		if readValue(path).present {
			_, err = links.LinkFile(m.f.ctx, *a, next, *c, a.Placement("copy", target.Root), ".env", nil, nil)
			must(m.f.t, err)
		}
		linked := false
		for _, link := range next.Links {
			if link.Root == target.Root {
				linked = true
			}
		}
		v := readValue(path)
		if !m.dirty[d] && !linked && v.present {
			m.dirty[d] = true
			m.addPending(d, v)
			m.last[d] = v
		}
		m.f.save(*a, next)
	}
}
func (m *exploration) discardInactive(d int) {
	if m.last[d] == deleted || m.corrupt[d] {
		return
	}
	active := m.places(d, true)
	pending := []value{}
	for _, v := range m.pendingOrder[d] {
		if contains(active, v) {
			pending = append(pending, v)
		}
	}
	if len(pending) == 0 {
		m.clean(d, m.agreed[d])
	} else {
		m.last[d] = pending[len(pending)-1]
	}
}
