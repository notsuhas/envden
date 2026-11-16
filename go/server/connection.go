package server

import (
	"context"
	"net"
	"sync"
	"time"
)

type compatibleConnection struct {
	net.Conn
	mu         sync.Mutex
	idle       *time.Timer
	generation uint64
	started    time.Time
}

type connectionKey struct{}

func connectionContext(ctx context.Context, conn net.Conn) context.Context {
	return context.WithValue(ctx, connectionKey{}, conn)
}

func (c *compatibleConnection) startRequest() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.idle != nil {
		c.idle.Stop()
	}
	c.generation++
}

func (c *compatibleConnection) finishRequest() {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Bun checks its ten-second idle timeout on four-second timer ticks.
	elapsed := time.Since(c.started)
	deadline := connectionIdleDeadline(elapsed)
	generation := c.generation
	c.idle = time.AfterFunc(deadline-elapsed, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.generation == generation {
			_ = c.Conn.Close()
		}
	})
}

func (c *compatibleConnection) Close() error {
	c.mu.Lock()
	if c.idle != nil {
		c.idle.Stop()
	}
	c.mu.Unlock()
	return c.Conn.Close()
}

func connectionIdleDeadline(elapsed time.Duration) time.Duration {
	return (elapsed/(4*time.Second) + 3) * (4 * time.Second)
}
