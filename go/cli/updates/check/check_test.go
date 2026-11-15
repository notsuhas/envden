package check

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestCheckRelease(t *testing.T) {
	calls := 0
	fetch := func(r *http.Request) (*http.Response, error) {
		calls++

		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://github.com/notsuhas/envden/releases/tag/v99.0.0"}}, Body: io.NopCloser(strings.NewReader(""))}, nil
	}
	at := int64(100)
	r := CheckRelease(context.Background(), &at, 101, fetch, false)
	if r.Kind != "skipped" || calls != 0 {
		t.Fatal(r, calls)
	}

	r = CheckRelease(context.Background(), nil, 101, fetch, true)
	if r.Kind != "checked" || r.Latest != "99.0.0" || r.Available == nil || !*r.Available {
		t.Fatal(r)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r = CheckRelease(ctx, nil, 101, func(r *http.Request) (*http.Response, error) { return nil, r.Context().Err() }, true)
	if r.Kind != "unavailable" || r.Message != "Cannot confirm envden is up to date" {
		t.Fatal(r)
	}
}
