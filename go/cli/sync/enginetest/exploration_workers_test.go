package enginetest

import (
	"context"
	"errors"
	"os"
	"sync"
)

const explorationWorkerCount = 4

type traceResult struct{ violations, notes, trace []string }

type traceWorker struct {
	ready     string
	run       func(traceCase) (traceResult, error)
	close     func() error
	terminate func() error
}

type workerSlot struct {
	mu        sync.Mutex
	directory string
	worker    traceWorker
}

type tracePool struct {
	slots   []*workerSlot
	factory func(string) traceWorker
	root    string
}

func (p *tracePool) create() (*workerSlot, error) {
	directory, err := os.MkdirTemp(p.root, "envden-sync-worker-")
	if err != nil {
		return nil, err
	}

	return &workerSlot{directory: directory, worker: p.factory(directory)}, nil
}

func (s *workerSlot) terminate() error {
	defer func() { _ = os.RemoveAll(s.directory) }() // Cleanup must not replace the worker termination result.

	return s.worker.terminate()
}

func (p *tracePool) start() error {
	for i := 0; i < explorationWorkerCount; i++ {
		slot, err := p.create()
		if err != nil {
			_ = p.stop() // Preserve the worker startup failure.

			return err
		}

		p.slots = append(p.slots, slot)
	}

	for _, slot := range p.slots {
		if slot.worker.ready != "ready" {
			_ = p.stop() // Preserve the worker startup failure.

			return errors.New("Exploration worker failed to start")
		}
	}

	return nil
}

func (p *tracePool) run(ctx context.Context, index int, tc traceCase, execute ...func(traceCase) (traceResult, error)) (traceResult, error) {
	slot := p.slots[index]
	slot.mu.Lock()
	defer slot.mu.Unlock()
	run := slot.worker.run

	if len(execute) > 0 {
		run = execute[0]
	}

	result, err := run(tc)

	if ctx.Err() != nil {
		err = errors.New("Exploration worker request aborted")
	}
	if err == nil {
		return result, nil
	}

	if e := slot.terminate(); e != nil {
		return traceResult{}, e
	}

	replacement, e := p.create()

	if e != nil {
		return traceResult{}, e
	}

	p.slots[index] = replacement

	if replacement.worker.ready != "ready" {
		return traceResult{}, errors.New("Exploration replacement worker failed to start")
	}

	return traceResult{}, err
}

func (p *tracePool) stop() error {
	var failure error

	for _, slot := range p.slots {
		if err := slot.worker.close(); err != nil && failure == nil {
			failure = err
		}
	}

	for _, slot := range p.slots {
		if err := slot.terminate(); err != nil && failure == nil {
			failure = err
		}
	}

	p.slots = nil

	return failure
}
