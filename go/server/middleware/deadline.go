package middleware

import (
	"bytes"
	"io"
	"net/http"
	"sync"
	"time"

	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	x "github.com/notsuhas/envden/go/server/shared"
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

func ReadBodyTimed(r *http.Request, limit int64, hash []byte, timing BodyTiming) []byte {
	capacity := DeclaredBodySize(r, limit)
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
		defer func() { go r.Body.Close() }()
		body = awaitBody(timing.Await, chunks, expired, capacity, extend)
	}
	if hash != nil && !bytes.Equal(c.SHA256(body), hash) {
		x.Fail(e.Unauthorized, "Request body hash mismatch")
	}

	return body
}

func awaitBody(await func(func()), chunks chan bodyChunk, expired chan struct{}, capacity int64, extend func(int64)) []byte {
	var body []byte

	await(func() { body = collectBody(chunks, expired, capacity, extend) })

	return body
}

func collectBody(chunks chan bodyChunk, expired chan struct{}, capacity int64, extend func(int64)) []byte {
	var body []byte

	for {
		select {
		case <-expired:
			x.Fail(e.InvalidInput, "Body read deadline exceeded")
		case chunk := <-chunks:
			if len(chunk.data) > 0 {
				if int64(len(body)+len(chunk.data)) > capacity {
					x.Fail(e.InvalidInput, "Request too large")
				}
				body = append(body, chunk.data...)
				extend(int64(len(body)))
			}
			if chunk.err != nil {
				if chunk.err != io.EOF {
					x.Check(chunk.err)
				}
				return body
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
