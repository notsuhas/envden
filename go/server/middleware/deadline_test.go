package middleware

import (
	"io"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

type blockingBody struct {
	first  bool
	read   chan struct{}
	closed chan struct{}
	once   sync.Once
}

func (b *blockingBody) Read(data []byte) (int, error) {
	if !b.first {
		b.first = true
		data[0] = 1

		return 1, nil
	}
	b.once.Do(func() { close(b.read) })
	<-b.closed

	return 0, io.EOF
}

func (b *blockingBody) Close() error {
	select {
	case <-b.closed:
	default:
		close(b.closed)
	}

	return nil
}

func TestBodyAbsoluteDeadline(t *testing.T) {
	body := &blockingBody{read: make(chan struct{}), closed: make(chan struct{})}
	request := httptest.NewRequest("POST", "/v1/swap", nil)
	request.Body = body
	var expire func()
	scheduled := make(chan time.Duration, 2)
	var clock int64
	schedule := func(fn func(), delay time.Duration) func() { expire = fn; scheduled <- delay; return func() {} }
	result := make(chan any, 1)
	go func() {
		_, err := ReadBodyTimed(request, 65536, nil, BodyTiming{Now: func() int64 { return clock }, Schedule: schedule})
		result <- err
	}()
	if got := <-scheduled; got != 10*time.Second {
		t.Fatal(got)
	}
	if got := <-scheduled; got != 10*time.Second {
		t.Fatal("one byte extended timeout", got)
	}
	<-body.read
	expire()
	cause := <-result
	err, ok := cause.(error)
	if !ok || !enverrors.Is(err, enverrors.InvalidInput) {
		t.Fatal(cause)
	}
	<-body.closed
}

func TestOnlyReceivedBytesExtendDeadline(t *testing.T) {
	request := httptest.NewRequest("POST", "/v1/swap", nil)
	request.Header.Set("Content-Length", "33554432")
	var scheduled []time.Duration
	_, err := ReadBodyTimed(request, 33554432, nil, BodyTiming{Now: func() int64 { return 0 }, Schedule: func(_ func(), delay time.Duration) func() { scheduled = append(scheduled, delay); return func() {} }})
	if err != nil {
		t.Fatal(err)
	}
	if len(scheduled) != 1 || scheduled[0] != 10*time.Second {
		t.Fatal(scheduled)
	}
}
