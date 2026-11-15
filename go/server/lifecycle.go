package server

import (
	"fmt"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	x "github.com/notsuhas/envden/go/server/shared"
	"time"
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
	safe := func(fn func()) (ok bool) {
		defer func() {
			if cause := recover(); cause != nil {
				suffix := ""
				if err, yes := cause.(*e.Error); yes {
					suffix = ": " + string(err.Code)
				}
				if o.Stderr != nil {
					fmt.Fprintln(o.Stderr, "envden history pruning failed"+suffix)
				}
			}
		}()
		fn()
		return true
	}
	prune := func(id []byte) bool {
		return safe(func() { x.Must(o.Storage.Prune(id, a.HistoryPolicy{MaxAge: 7776000000, MinVersions: 20}, o.Now())) })
	}
	server := prune(make([]byte, 32))
	vaults := true
	listed := safe(func() {
		for _, id := range x.Must(o.Storage.VaultIDs()) {
			if !prune(id) {
				vaults = false
			}
		}
	})
	return server && listed && vaults
}
