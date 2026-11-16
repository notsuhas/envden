package server

import (
	"io"
	"maps"
	"net/http"
	"slices"
	"strings"
	"testing"
)

func TestHeadAnswersLikeGet(t *testing.T) {
	port := 0
	running, err := Serve(ServeOptions{DataDir: t.TempDir(), Port: &port, Now: func() int64 { return 1000 }, Scheduler: &manualScheduler{}, Stdout: io.Discard, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = running.Shutdown() })

	hello := "v1/hello?challenge=" + strings.Repeat("A", 43)
	for _, path := range []string{"", "v1/status", hello, "v1/head", "v1/devices", "nope"} {
		get, _ := fetch(t, "GET", running.URL+path)
		head, body := fetch(t, "HEAD", running.URL+path)
		if get.StatusCode != head.StatusCode || !maps.EqualFunc(get.Header, head.Header, slices.Equal) {
			t.Errorf("/%s: HEAD %d %v, GET %d %v", path, head.StatusCode, head.Header, get.StatusCode, get.Header)
		}

		if len(body) != 0 {
			t.Errorf("/%s: HEAD body %q", path, body)
		}
	}
}

func fetch(t *testing.T, method, url string) (responseMetadata, []byte) {
	t.Helper()
	r, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatal(err)
	}

	response, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}

	response.Header.Del("Date")
	response.Header.Del("Content-Length")

	return responseMetadata{Status: response.Status, StatusCode: response.StatusCode, Header: response.Header}, body
}
