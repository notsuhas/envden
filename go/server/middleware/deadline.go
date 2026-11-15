package middleware

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
)

type BodyTiming struct {
	Now      func() int64
	Schedule func(func(), time.Duration) func()
	Await    func(fn func())
}

type bodyChunk struct {
	data []byte
	err  error
}

func ReadBodyTimed(r *http.Request, limit int64, hash []byte, timing BodyTiming) ([]byte, error) {
	capacity, err := DeclaredBodySize(r, limit)
	if err != nil {
		return nil, err
	}
	if timing.Now == nil {
		timing.Now = systemBodyClock()
	}
	if timing.Await == nil {
		timing.Await = func(fn func()) { fn() }
	}
	if timing.Schedule == nil {
		timing.Schedule = scheduleBodyDeadline
	}
	started := timing.Now()
	expired := make(chan struct{})
	once := sync.Once{}
	expire := func() { once.Do(func() { close(expired) }) }
	stop := func() {}
	extend := func(size int64) {
		stop()
		milliseconds := max(0, min(int64(600000), 10000+size/32768*1000)-(timing.Now()-started))
		stop = timing.Schedule(expire, time.Duration(milliseconds)*time.Millisecond)
	}
	extend(0)
	defer func() { stop() }()
	var body []byte
	if r.Body != nil && r.Body != http.NoBody {
		done := make(chan struct{})
		defer close(done)
		chunks := make(chan bodyChunk)
		go func() {
			for {
				buffer := make([]byte, 32768)
				n, err := r.Body.Read(buffer)
				select {
				case chunks <- bodyChunk{buffer[:n], err}:
				case <-done:
					return
				}
				if err != nil {
					return
				}
			}
		}()
		defer func() { go func() { _ = r.Body.Close() }() }()
		awaitBodyResult, err := awaitBody(timing.Await, chunks, expired, capacity, extend)
		if err != nil {
			return nil, err
		}

		body = awaitBodyResult
	}
	if hash != nil && !bytes.Equal(crypto.SHA256(body), hash) {
		return nil, enverrors.New(enverrors.Unauthorized, "Request body hash mismatch")
	}

	return body, nil
}

func awaitBody(await func(func()), chunks chan bodyChunk, expired chan struct{}, capacity int64, extend func(int64)) ([]byte, error) {
	var body []byte

	var err error
	await(func() { body, err = collectBody(chunks, expired, capacity, extend) })

	return body, err
}

func collectBody(chunks chan bodyChunk, expired chan struct{}, capacity int64, extend func(int64)) ([]byte, error) {
	var body []byte

	for {
		select {
		case <-expired:
			return nil, enverrors.New(enverrors.InvalidInput, "Body read deadline exceeded")

		case chunk := <-chunks:
			if len(chunk.data) > 0 {
				if int64(len(body)+len(chunk.data)) > capacity {
					return nil, enverrors.New(enverrors.InvalidInput, "Request too large")
				}
				body = append(body, chunk.data...)
				extend(int64(len(body)))
			}
			if chunk.err != nil {
				if !errors.Is(chunk.err, io.EOF) {
					if err := chunk.err; err != nil {
						return nil, err
					}
				}

				return body, nil
			}
		}
	}
}

func scheduleBodyDeadline(expire func(), timeout time.Duration) func() {
	timer := time.AfterFunc(timeout, expire)

	return func() { timer.Stop() }
}

func systemBodyClock() func() int64 {
	start := time.Now()

	return func() int64 { return time.Since(start).Milliseconds() }
}
