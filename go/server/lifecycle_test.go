package server

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

type scheduled struct {
	delay     time.Duration
	every     bool
	run       func()
	cancelled bool
}

type manualScheduler struct{ jobs []*scheduled }

func (s *manualScheduler) After(delay time.Duration, run func()) func() {
	job := &scheduled{delay: delay, run: run}
	s.jobs = append(s.jobs, job)

	return func() { job.cancelled = true }
}

func (s *manualScheduler) Every(delay time.Duration, run func()) func() {
	job := &scheduled{delay: delay, every: true, run: run}
	s.jobs = append(s.jobs, job)

	return func() { job.cancelled = true }
}

func TestServeLifecycle(t *testing.T) {
	var stdout bytes.Buffer
	scheduler := &manualScheduler{}
	calls := 0
	port := 0
	running, err := Serve(ServeOptions{DataDir: t.TempDir(), Port: &port, Now: func() int64 { calls++; return 1000 }, Scheduler: scheduler, Stdout: &stdout, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = running.Shutdown() }()
	if calls == 0 || len(scheduler.jobs) != 2 || scheduler.jobs[0].delay != time.Minute || scheduler.jobs[0].every || scheduler.jobs[1].delay != time.Hour || !scheduler.jobs[1].every {
		t.Fatal("scheduler", scheduler)
	}
	lines := strings.Split(strings.TrimSuffix(stdout.String(), "\n"), "\n")
	if len(lines) != 3 || lines[0] != "Setup token. Paste it when `envden setup` or `envden server move` asks:" || !strings.HasPrefix(lines[1], "  ") || lines[2] != "envden listening on "+running.URL {
		t.Fatal(stdout.String())
	}
	response, err := http.Get(running.URL + "v1/status")
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal(response.StatusCode)
	}
	scheduler.jobs[0].run()
	if running.App.status.LastPrune == nil || !running.App.status.LastPrune.OK || running.App.status.LastPrune.At != 1000 {
		t.Fatal("prune state")
	}
	if err = running.Shutdown(); err != nil {
		t.Fatal(err)
	}
	if err = running.Shutdown(); err != nil {
		t.Fatal(err)
	}
	for _, job := range scheduler.jobs {
		if !job.cancelled {
			t.Fatal("job not cancelled")
		}
	}
	if _, err = running.Storage.VaultIDs(); err == nil {
		t.Fatal("storage still open")
	}
}

func TestLocalSetupReissue(t *testing.T) {
	dir := t.TempDir()
	first, err := LocalSetupToken(dir, 1)
	if err != nil {
		t.Fatal(err)
	}
	second, err := LocalSetupToken(dir, 2)
	if err != nil {
		t.Fatal(err)
	}
	if first == "" || first == second {
		t.Fatal("expected fresh setup token")
	}
}

func TestConnectionTimeouts(t *testing.T) {
	port := 0
	running, err := Serve(ServeOptions{DataDir: t.TempDir(), Port: &port, Now: func() int64 { return 1000 }, Scheduler: &manualScheduler{}, Stdout: io.Discard, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = running.Shutdown() }()
	if running.Server.ReadHeaderTimeout != 10*time.Second || running.Server.IdleTimeout != 10*time.Second {
		t.Fatal(running.Server.ReadHeaderTimeout, running.Server.IdleTimeout)
	}
}

func TestBusyPortMessage(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	port := listener.Addr().(*net.TCPAddr).Port
	_, err = Serve(ServeOptions{DataDir: t.TempDir(), Port: &port, Now: func() int64 { return 0 }, Stdout: io.Discard, Stderr: io.Discard})
	if err == nil || err.Error() != fmt.Sprintf("Failed to start server. Is port %d in use?", port) {
		t.Fatal(err)
	}
}
