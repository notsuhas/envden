package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	mw "github.com/notsuhas/envden/go/server/middleware"
)

func TestAwaitReleasesTheRequestLock(t *testing.T) {
	app := &App{}
	released := false

	app.mu.Lock()
	app.await(func() {
		released = app.mu.TryLock()
		if released {
			app.mu.Unlock()
		}
	})
	app.mu.Unlock()

	if !released {
		t.Fatal("lock held while awaiting body I/O")
	}
}

func TestBodyReadRunsInsideAwait(t *testing.T) {
	request := httptest.NewRequest("POST", "/v1/x", strings.NewReader("body"))
	inside := false
	await := func(fn func()) {
		inside = true
		fn()
	}

	body := mw.ReadBodyTimed(request, 1024, nil, mw.BodyTiming{Now: func() int64 { return 0 }, Await: await})

	if !inside || string(body) != "body" {
		t.Fatalf("inside=%v body=%q", inside, body)
	}
}
