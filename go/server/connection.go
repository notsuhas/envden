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
}

// idleTimeout bounds keep-alive, request headers and an unread body after a rejection.
const idleTimeout = 10 * time.Second

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
	generation := c.generation
	c.idle = time.AfterFunc(idleTimeout, func() {
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
