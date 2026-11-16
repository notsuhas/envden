package enginetest

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/cli/links/checkout"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/core/adapters"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

func (m *exploration) apply(raw string) {
	m.token = raw
	m.trace = append(m.trace, raw)
	d := 0

	if raw[0] != 'A' {
		d = 1
	}

	parts := strings.SplitN(raw, "=", 2)
	head := parts[0]
	op := head[1:]
	index := 0

	if c := head[len(head)-1]; c >= '0' && c <= '9' {
		index = int(c - '0')
		op = op[:len(op)-1]
	}

	if op == "f" && len(head) == 2 {
		index = len(m.targets[d]) - 1
	}

	target := m.targets[d][index]
	path := filepath.Join(target.Root, target.Path)
	home := m.devices[d].Home

	switch op {
	case "e", "r":
		text := original
		if op != "r" || len(parts) > 1 {
			v := ""

			if len(parts) > 1 {
				v = parts[1]
			} else {
				v = "u" + strconv.Itoa(m.unique)
				m.unique++
			}

			text = "TOKEN=" + v + "\n"
		}
		m.write(d, index, value{text, true})
	case "l":
		m.doPull(d, -1, false)
	case "f":
		m.doPull(d, index, false)
	case "s":
		m.doPush(d, "")
	case "x":
		m.doPush(d, "lost")
	case "n":
		m.doPush(d, "unsent")
	case "m":
		m.doRemove(d)
	case "k":
		m.doResolve(d, "keep-mine")
	case "t":
		m.doResolve(d, "take-server")
	case "u":
		m.doRetrack(d)
	case "d":
		text := original
		if len(parts) > 1 && parts[1] != "" {
			text = "TOKEN=" + parts[1] + "\n"
		}
		before := readValue(path)
		must(m.f.t, os.RemoveAll(path))
		m.f.write(path, text)
		if before != (value{text, true}) {
			m.recordPlaceEdit(d, index, value{text, true}, before)
		}
		m.settleUnobserved(d, index)
	case "z":
		if m.restores[d] != nil {
			return
		}
		m.skipped[target.Root] = true
		a := m.devices[d]
		original := a.Repo
		m.restores[d] = func() { a.Repo = original }
		a.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: func(root string) (*adapters.Checkout, error) {
			if root == target.Root {
				return nil, nil
			}

			return original.CheckoutAt(root)
		}, CaseInsensitive: original.CaseInsensitive, EnsureIgnored: original.EnsureIgnored})
	case "y":
		if restore := m.restores[d]; restore != nil {
			restore()
			delete(m.restores, d)
		}
		for _, target := range m.targets[d] {
			delete(m.skipped, target.Root)
		}
		m.resumeSkipped()
	case "del", "store":
		if op == "store" {
			path = target.Store
		}
		before := readValue(path)
		must(m.f.t, os.RemoveAll(path))
		if before.present && !contains(m.places(d, false), before) {
			delete(m.required, before.text)
		}
		m.discardInactive(d)
	case "tmp":
		m.f.write(filepath.Join(home, "state", "attempts", ".interrupted.tmp"), "{\"header\":")
		m.f.write(filepath.Join(home, "state", "attempts", "stray"), "stray")
	case "corrupt":
		m.f.write(filepath.Join(home, "state", "attempts", strings.Repeat("A", 43)), "broken")
		m.dirty[d] = true
		m.corrupt[d] = true
	case "v":
		if m.untracked[target.Root] || m.skipped[target.Root] {
			return
		}
		cancelled, err := checkout.Untrack(m.f.ctx, *m.devices[d], target.Root)
		must(m.f.t, err)
		m.untracked[target.Root] = true
		m.discardInactive(d)
		if len(cancelled) > 0 && m.last[d] == deleted {
			m.clean(d, m.agreed[d])
		}
	case "q":
		m.killPull(d)
	default:
		m.f.t.Fatal(fmt.Sprintf("unknown operation %s", raw))
	}
}

func (m *exploration) killPull(d int) {
	opts := m.f.opts
	reports := []string{}
	writes := 0
	killed := false
	opts.Report = func(v string) { reports = append(reports, v) }
	opts.AtomicWrite = func(path string, data []byte) error {
		if strings.HasSuffix(path, ".pending") {
			writes++
		}

		if strings.HasSuffix(path, ".pending") && writes == 2 {
			killed = true

			return errors.New("Killed before written mark")
		}

		return statefiles.AtomicWrite(path, data, clock)
	}
	result, err := syncer.Pull(m.f.ctx, *m.devices[d], opts)

	if !killed {
		m.note(err, "pull")
	}

	m.checkCorrupt(d, reports)
	m.absorb(reports)
	m.observe(d)
	if err == nil {
		m.seen[d] = len(m.commits) - 1
	}

	if !killed && err == nil {
		m.checkPull(d, result, m.conflictCount(d), m.places(d, true))

		if m.step != 99 {
			before := m.places(d, false)
			opts.AtomicWrite = nil
			reports = nil
			again, err := syncer.Pull(m.f.ctx, *m.devices[d], opts)
			m.absorb(reports)
			if err != nil {
				m.note(err, "second pull")
			} else if again.Changed != 0 || !reflect.DeepEqual(before, m.places(d, false)) {
				m.bad("I4-second-pull", "second pull changed places")
			}
		}
	}
}
