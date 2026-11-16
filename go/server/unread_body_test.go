package server

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestUnreadBodyConnection(t *testing.T) {
	port := 0
	running, err := Serve(ServeOptions{DataDir: t.TempDir(), Port: &port, Now: func() int64 { return 1000 }, Scheduler: &manualScheduler{}, Stdout: io.Discard, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = running.Shutdown() })
	for _, tc := range []struct {
		method, path string
		status       int
		length       int
	}{{"POST", "/missing", 404, 1}, {"POST", "/v1/vault", 400, 1}, {"GET", "/v1/status", 400, 1}, {"HEAD", "/v1/status", 404, 1}, {"GET", "/missing", 404, 1}, {"POST", "/large-missing", 404, 262145}} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			t.Parallel()
			conn, err := net.Dial("tcp", strings.TrimSuffix(strings.TrimPrefix(running.URL, "http://"), "/"))
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = conn.Close() }()
			_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
			_, err = fmt.Fprintf(conn, "%s %s HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n", tc.method, tc.path, tc.length)
			if err != nil {
				t.Fatal(err)
			}
			reader := bufio.NewReader(conn)
			response, err := http.ReadResponse(reader, &http.Request{Method: tc.method})
			if err != nil {
				t.Fatal("response withheld while draining body:", err)
			}
			if response.StatusCode != tc.status {
				t.Fatal(response.StatusCode)
			}
			if _, err = io.ReadAll(response.Body); err != nil {
				t.Fatal(err)
			}
			_ = response.Body.Close()
			_ = conn.SetReadDeadline(time.Now().Add(14 * time.Second))
			if extra, err := io.ReadAll(reader); err != nil || len(extra) != 0 {
				t.Fatalf("connection not closed cleanly: %q %v", extra, err)
			}
		})
	}
}

func TestConnectionIdleDeadline(t *testing.T) {
	for _, row := range []struct{ elapsed, want time.Duration }{{0, 12 * time.Second}, {10 * time.Second, 20 * time.Second}, {12 * time.Second, 24 * time.Second}, {600 * time.Second, 612 * time.Second}} {
		if got := connectionIdleDeadline(row.elapsed); got != row.want {
			t.Fatalf("%v: %v want %v", row.elapsed, got, row.want)
		}
	}
}
