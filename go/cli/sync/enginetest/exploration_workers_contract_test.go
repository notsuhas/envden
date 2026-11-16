package enginetest

import (
	"context"
	"os"
	"strings"
	"testing"
)

func fakeWorkerFactory(replacementReady bool) func(string) traceWorker {
	created := 0

	return func(string) traceWorker {
		created++
		ready := "ready"

		if created > 4 && !replacementReady {
			ready = "error"
		}

		return traceWorker{ready: ready, run: func(traceCase) (traceResult, error) { return traceResult{}, nil }, close: func() error { return nil }, terminate: func() error { return nil }}
	}
}

func TestAbortedExplorationReplacesSlotAndCleansDirectories(t *testing.T) {
	root := t.TempDir()
	pool := tracePool{root: root, factory: fakeWorkerFactory(true)}
	must(t, pool.start())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := pool.run(ctx, 0, traceCase{Layout: []string{"copy"}, Tokens: []string{"Be", "Bs"}})
	if err == nil {
		t.Fatal("expected abort")
	}

	result, err := pool.run(context.Background(), 0, traceCase{Layout: []string{"copy"}, Tokens: []string{"Bl"}})
	must(t, err)
	equal(t, len(result.violations), 0)
	must(t, pool.stop())
	entries, err := os.ReadDir(root)
	must(t, err)
	equal(t, len(entries), 0)
}

func TestExplorationWorkersLeaveDeadlinesToRunner(t *testing.T) {
	source, err := os.ReadFile("exploration_workers_test.go")
	must(t, err)

	if strings.Contains(string(source), "WithTimeout") {
		t.Fatal("worker imposes its own deadline")
	}
}

func TestExplorationReplacementRequiresReady(t *testing.T) {
	pool := tracePool{root: t.TempDir(), factory: fakeWorkerFactory(false)}
	must(t, pool.start())
	defer func() { must(t, pool.stop()) }()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := pool.run(ctx, 0, traceCase{Layout: []string{"copy"}})
	if err == nil || !strings.Contains(err.Error(), "replacement worker failed to start") {
		t.Fatal(err)
	}
}
