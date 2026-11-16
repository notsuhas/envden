package ui

import (
	"context"
	"fmt"
	"io"
	"net"
	"strings"
	"testing"
	"time"
)

func TestDashboardIdleConnections(t *testing.T) {
	for _, kind := range []string{"empty", "partial", "keepalive", "unread"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			ready := make(chan string, 1)
			done := make(chan error, 1)
			go func() {
				_, err := RunDashboard(ctx, DashboardOptions{Interactive: true, Report: func(s string) {
					if strings.HasPrefix(s, "envden ui: ") {
						ready <- strings.Split(strings.TrimPrefix(s, "envden ui: http://"), "/")[0]
					}
				}})
				done <- err
			}()
			address := <-ready
			conn, err := net.Dial("tcp", address)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = conn.Close() }()
			start := time.Now()
			_ = conn.SetReadDeadline(start.Add(15 * time.Second))
			switch kind {
			case "partial":
				_, err = io.WriteString(conn, "GET / HTTP/1.1\r\n")
			case "keepalive":
				_, err = fmt.Fprintf(conn, "GET / HTTP/1.1\r\nHost: %s\r\n\r\n", address)
			case "unread":
				_, err = fmt.Fprintf(conn, "POST /missing HTTP/1.1\r\nHost: %s\r\nContent-Length: 1\r\n\r\n", address)
			}
			if err != nil {
				t.Fatal(err)
			}
			_, err = io.Copy(io.Discard, conn)
			if elapsed := time.Since(start); err != nil || elapsed < 10*time.Second || elapsed > 14*time.Second {
				t.Errorf("closed after %v: %v", elapsed, err)
			}
			cancel()
			if err := <-done; err != nil {
				t.Fatal(err)
			}
		})
	}
}
