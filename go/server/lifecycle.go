package server

import (
	"fmt"
	"time"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
)

type systemScheduler struct{}

func (systemScheduler) After(delay time.Duration, run func()) func() {
	timer := time.AfterFunc(delay, run)

	return func() { timer.Stop() }
}

func (systemScheduler) Every(delay time.Duration, run func()) func() {
	ticker := time.NewTicker(delay)
	stop := make(chan struct{})
	go func() {
		for {
			select {
			case <-ticker.C:
				run()
			case <-stop:
				return
			}
		}
	}()

	return func() { ticker.Stop(); close(stop) }
}

func pruneHistory(o Options) bool {
	report := func(err error) bool {
		if err == nil {
			return true
		}
		suffix := ""
		if domain, ok := enverrors.As(err); ok {
			suffix = ": " + string(domain.Code)
		}
		if o.Stderr != nil {
			_, _ = fmt.Fprintln(o.Stderr, "envden history pruning failed"+suffix)
		}

		return false
	}
	prune := func(id []byte) bool {
		_, err := o.Storage.Prune(id, adapters.HistoryPolicy{MaxAge: 7776000000, MinVersions: 20}, o.Now())

		return report(err)
	}
	server := prune(make([]byte, 32))
	ids, err := o.Storage.VaultIDs()
	listed := report(err)
	vaults := true
	if listed {
		for _, id := range ids {
			if !prune(id) {
				vaults = false
			}
		}
	}

	return server && listed && vaults
}
