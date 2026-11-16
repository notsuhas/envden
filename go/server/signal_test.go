//go:build !windows

package server

import (
	"io"
	"strings"
	"syscall"
	"testing"
	"time"
)

type signalOnListening struct{}

func (signalOnListening) Write(p []byte) (int, error) {
	if strings.HasPrefix(string(p), "envden listening on ") {
		_ = syscall.Kill(syscall.Getpid(), syscall.SIGTERM)
	}

	return len(p), nil
}

type cancelScheduler struct{ cancelled chan struct{} }

func (s cancelScheduler) After(time.Duration, func()) func() { return func() {} }

func (s cancelScheduler) Every(time.Duration, func()) func() {
	return func() { close(s.cancelled) }
}

func TestSignalRightAfterListeningShutsDown(t *testing.T) {
	port := 0
	scheduler := cancelScheduler{cancelled: make(chan struct{})}
	running, err := Serve(ServeOptions{DataDir: t.TempDir(), Port: &port, Now: func() int64 { return 1000 }, Scheduler: scheduler, Stdout: signalOnListening{}, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}

	<-scheduler.cancelled
	if err := running.Shutdown(); err != nil {
		t.Fatal(err)
	}
}
