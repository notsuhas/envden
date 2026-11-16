package enginetest

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"path/filepath"
	"sync"
	"testing"
)

type value struct {
	text    string
	present bool
}

func readValue(path string) value { b, err := osRead(path); return value{string(b), err == nil} }

type reference struct {
	commits         []value
	seen            [2]int
	edited, removal [2]bool
	required        map[value]bool
}
type interleaving struct {
	f                                    *fixture
	devices                              []contracts.Adapters
	roots, stores, paths, saved, reports []string
	model                                reference
}

func interleavingSequences() [][]int {
	result := [][]int{}
	for op := 0; op < 20; op++ {
		result = append(result, []int{op})
	}
	seed := uint32(731)
	for i := 0; i < 24; i++ {
		seq := []int{}
		for j := 0; j < 8; j++ {
			seed = seed*1664525 + 1013904223
			seq = append(seq, int(seed%20))
		}
		result = append(result, seq)
	}
	return result
}
func TestInterleaving(t *testing.T) {
	for index, sequence := range interleavingSequences() {
		t.Run(fmt.Sprintf("%d:%v", index, sequence), func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout("copy", "copy", "link")
			run := interleaving{f: f, devices: []contracts.Adapters{f.first, f.second}, roots: []string{f.checkout.Root, targets[0].Root}, stores: []string{f.aStore, targets[0].Store}, model: reference{commits: []value{{original, true}}, required: map[value]bool{}}}
			run.paths = append(run.paths, filepath.Join(f.checkout.Root, ".env"))
			for _, target := range targets {
				run.paths = append(run.paths, filepath.Join(target.Root, ".env"))
			}
			for step, code := range sequence {
				run.apply(code%2, code/2, fmt.Sprintf("TOKEN=edit-%d-%d\n", index, step))
				run.survive()
			}
			for d := 0; d < 2; d++ {
				run.send(d, false)
			}
			results := make([]syncer.Result, 2)
			errors := make([]error, 2)
			reports := make([][]string, 2)
			var waiting sync.WaitGroup
			for d := range run.devices {
				waiting.Add(1)
				go func(d int) {
					defer waiting.Done()
					opts := f.opts
					opts.Report = func(report string) { reports[d] = append(reports[d], report) }
					results[d], errors[d] = syncer.Pull(f.ctx, run.devices[d], opts)
				}(d)
			}
			waiting.Wait()
			for d := range run.devices {
				must(t, errors[d])
				run.reports = append(run.reports, reports[d]...)
			}
			if results[0].Conflicts > 0 || results[1].Conflicts > 0 {
				return
			}
			server := f.serverValue()
			for _, path := range append(append([]string{}, run.stores...), run.paths...) {
				equal(t, readValue(path), server)
			}
		})
	}
}
func (r *interleaving) options() syncer.Options {
	o := r.f.opts
	o.Report = func(m string) { r.reports = append(r.reports, m) }
	return o
}
func (r *interleaving) user(d int, next value) {
	before := readValue(filepath.Join(r.roots[d], ".env"))
	delete(r.model.required, before)
	if next.present {
		r.model.required[next] = true
	}
	r.model.edited[d] = true
	r.model.removal[d] = !next.present
}
func (r *interleaving) observe(d int) {
	next := readValue(filepath.Join(r.roots[d], ".env"))
	if next.present {
		r.model.removal[d] = false
	}
	if next == r.model.commits[len(r.model.commits)-1] {
		r.model.seen[d] = len(r.model.commits) - 1
	}
}
func (r *interleaving) commit(d int) {
	next := r.f.serverValue()
	head := r.model.commits[len(r.model.commits)-1]
	if next == head {
		return
	}
	if !next.present {
		equal(r.f.t, r.model.removal[d], true)
	}
	if next.present {
		for _, c := range r.model.commits {
			if c == next {
				equal(r.f.t, r.model.edited[d], true)
				equal(r.f.t, r.model.seen[d], len(r.model.commits)-1)
				break
			}
		}
	}
	r.model.commits = append(r.model.commits, next)
	r.model.seen[d] = len(r.model.commits) - 1
	r.model.edited[d] = false
}
func (r *interleaving) survive() {
	for _, report := range r.reports {
		if m := savedReport.FindStringSubmatch(report); len(m) > 1 {
			r.saved = append(r.saved, m[1])
		}
	}
	for _, a := range r.devices {
		records, err := local.ConflictRecords(a.Home)
		must(r.f.t, err)
		for _, record := range records {
			r.saved = append(r.saved, record.Alternatives...)
		}
	}
	values := map[value]bool{}
	for _, path := range append(append(append([]string{}, r.stores...), r.paths...), r.saved...) {
		values[readValue(path)] = true
	}
	for v := range r.model.required {
		if !values[v] {
			r.f.t.Fatalf("lost edit %q", v.text)
		}
	}
}
