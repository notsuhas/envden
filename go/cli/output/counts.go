package output

import (
	"context"
	"sync"
)

type Counts struct {
	mu                 sync.Mutex
	Changed, Conflicts *int
}

type countsKey struct{}

func WithCommandCounts(ctx context.Context) context.Context {
	return context.WithValue(ctx, countsKey{}, &Counts{})
}

func CommandCounts(ctx context.Context) *Counts { v, _ := ctx.Value(countsKey{}).(*Counts); return v }

func SetCommandCounts(ctx context.Context, changed, conflicts *int) {
	if c := CommandCounts(ctx); c != nil {
		c.mu.Lock()
		defer c.mu.Unlock()
		c.Changed = changed
		c.Conflicts = conflicts
	}
}
