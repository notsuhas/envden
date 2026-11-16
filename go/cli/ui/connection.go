package ui

import (
	"net"
	"sync"
	"time"
)

// Keep-alive, request headers and an unread body after a rejection all close after this.
const idleTimeout = 10 * time.Second

type dashboardListener struct{ net.Listener }

type dashboardConnection struct {
	net.Conn
	mu     sync.Mutex
	timer  *time.Timer
	closed bool
}

func (l dashboardListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}

	c := &dashboardConnection{Conn: conn}
	c.touch()

	return c, nil
}

func (c *dashboardConnection) touch() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	if c.timer != nil {
		c.timer.Stop()
	}

	c.timer = time.AfterFunc(idleTimeout, func() { _ = c.Close() })
}

func (c *dashboardConnection) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if n > 0 {
		c.touch()
	}

	return n, err
}

func (c *dashboardConnection) Write(p []byte) (int, error) {
	n, err := c.Conn.Write(p)
	if n > 0 {
		c.touch()
	}

	return n, err
}

func (c *dashboardConnection) Close() error {
	c.mu.Lock()
	c.closed = true
	if c.timer != nil {
		c.timer.Stop()
	}
	c.mu.Unlock()

	return c.Conn.Close()
}
