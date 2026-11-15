package fetch

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestBoundedFetch(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	fetch, stop := BoundedFetch(ctx, func(*http.Request) (*http.Response, error) { t.Fatal("cancelled fetch called"); return nil, nil })
	defer stop()
	request, _ := http.NewRequestWithContext(context.Background(), "GET", "https://example.invalid", nil)
	if _, e := fetch(request); e == nil {
		t.Fatal("deadline ignored")
	}
	fetch, stop = BoundedFetch(context.Background(), func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("body"))}, nil
	})
	defer stop()
	response, e := fetch(request)
	if e != nil {
		t.Fatal(e)
	}
	raw, e := io.ReadAll(response.Body)
	response.Body.Close()
	if e != nil || string(raw) != "body" {
		t.Fatal(string(raw), e)
	}
}
