package enginetest

import (
	"errors"
	"github.com/notsuhas/envden/go/cli/client"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"net/http"
	"reflect"
)

func (m *exploration) doPush(d int, lost string) {
	reports := []string{}
	opts := m.f.opts
	opts.Report = func(v string) { reports = append(reports, v) }
	swapped := false
	if lost != "" {
		opts.Fetcher = func(req *http.Request) (*http.Response, error) {
			swap := req.URL.Path == "/v1/swap"
			if swap && lost == "unsent" {
				swapped = true
				return nil, errors.New("Request never sent")
			}
			response, err := client.DefaultFetch(req)
			if swap && err == nil {
				swapped = true
				response.Body.Close()
				return nil, errors.New("Lost response")
			}
			return response, err
		}
	}
	result, err := syncer.Push(m.f.ctx, *m.devices[d], opts)
	var observed *syncer.Result
	if err == nil {
		observed = &result
	} else if !(lost != "" && swapped) {
		m.note(err, "push")
	}
	m.checkCorrupt(d, reports)
	m.absorb(reports)
	m.observe(d)
	m.checkPush(d, m.f.serverValue(), observed, reports)
}
func (m *exploration) doPull(d, fail int, quiet bool) *syncer.Result {
	reports := []string{}
	opts := m.f.opts
	opts.Report = func(v string) { reports = append(reports, v) }
	restore := func() {}
	if fail >= 0 {
		if d == 1 {
			restore = failIgnored(m.f, m.targets[d][fail].Root)
		} else {
			old := m.f.second
			m.f.second = *m.devices[d]
			restoreFirst := failIgnored(m.f, m.targets[d][fail].Root)
			*m.devices[d] = m.f.second
			m.f.second = old
			restore = func() {
				old := m.f.second
				m.f.second = *m.devices[d]
				restoreFirst()
				*m.devices[d] = m.f.second
				m.f.second = old
			}
		}
	}
	result, err := syncer.Pull(m.f.ctx, *m.devices[d], opts)
	restore()
	m.checkCorrupt(d, reports)
	m.absorb(reports)
	m.observe(d)
	if err != nil {
		m.note(err, "pull")
		return nil
	}
	m.seen[d] = len(m.commits) - 1
	now := m.places(d, false)
	if quiet {
		return &result
	}
	if fail < 0 || result.Conflicts == 0 {
		m.checkPull(d, result, m.conflictCount(d), m.places(d, true))
	}
	if fail >= 0 || m.step == 99 {
		return &result
	}
	reports = nil
	again, err := syncer.Pull(m.f.ctx, *m.devices[d], opts)
	m.absorb(reports)
	if err != nil {
		m.note(err, "second pull")
	} else if again.Changed != 0 || !reflect.DeepEqual(now, m.places(d, false)) {
		m.bad("I4-second-pull", "second pull changed places")
	}
	return &result
}
