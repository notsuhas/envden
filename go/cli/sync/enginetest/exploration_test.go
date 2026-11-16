package enginetest

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	state "github.com/notsuhas/envden/go/cli/state/model"
)

type traceCase struct {
	Label          string
	Layout, Tokens []string
}

type explorationWorld struct {
	f        *fixture
	targets  []state.Link
	snapshot *snapshot
	devices  [2]contracts.Adapters
}

type fixtureLifetime struct{ current, owner testContext }

func (o fixtureLifetime) Helper() { o.current.Helper() }

func (o fixtureLifetime) Fatal(v ...any) { o.current.Fatal(v...) }

func (o fixtureLifetime) Fatalf(format string, v ...any) { o.current.Fatalf(format, v...) }

func (o fixtureLifetime) TempDir() string { return o.owner.TempDir() }

func (o fixtureLifetime) Cleanup(fn func()) { o.owner.Cleanup(fn) }

func TestExploration(t *testing.T) {
	cases := generatedTraces()
	raw, err := os.ReadFile(filepath.Join("testdata", "exploration.json"))
	must(t, err)
	var targeted []traceCase
	must(t, json.Unmarshal(raw, &targeted))
	cases = append(cases, targeted...)
	worlds := [explorationWorkerCount]explorationCache{}
	pool := tracePool{root: t.TempDir(), factory: func(string) traceWorker {
		return traceWorker{ready: "ready", run: func(traceCase) (traceResult, error) { return traceResult{}, nil }, close: func() error { return nil }, terminate: func() error { return nil }}
	}}
	must(t, pool.start())
	t.Cleanup(func() { must(t, pool.stop()) })
	owner := t
	var workers sync.WaitGroup

	for slot := 0; slot < explorationWorkerCount; slot++ {
		workers.Add(1)
		go func(slot int) {
			defer workers.Done()

			for index := slot; index < len(cases); index += explorationWorkerCount {
				tc := cases[index]
				name := tc.Label + " " + strings.Join(tc.Layout, "+") + " " + strings.Join(tc.Tokens, " ")
				t.Run(name, func(t *testing.T) {
					execute := func(tc traceCase) (traceResult, error) {
						slot := index % explorationWorkerCount
						w := worlds[slot].world(t, owner, tc.Layout)
						w.snapshot.restore(t)
						w.f.t = t
						w.f.first = w.devices[0]
						w.f.second = w.devices[1]
						m := newExploration(w.f, w.targets)

						for _, token := range tc.Tokens {
							expanded := []string{token}

							switch token {
							case "a":
								expanded = []string{"Al", "Ae", "As"}
							case "r":
								expanded = []string{"Al", "Ar", "As"}
							}

							for _, op := range expanded {
								m.apply(op)
								m.survive()
							}

							m.step++
						}

						m.close()

						return traceResult{m.violations, m.notes, m.trace}, nil
					}
					result, err := pool.run(context.Background(), index%explorationWorkerCount, tc, execute)
					must(t, err)

					if len(result.violations) > 0 || len(result.notes) > 0 {
						t.Fatalf("violations: %v\nnotes: %v\ntrace: %v", result.violations, result.notes, result.trace)
					}
				})
			}
		}(slot)
	}

	workers.Wait()
}
