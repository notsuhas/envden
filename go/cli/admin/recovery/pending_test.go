package recovery_test

import (
	admin "github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/client"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestReplacementSettlesLostResponse(t *testing.T) {
	f := newFixture(t, false)
	failed := false
	shown := 0
	fetch := client.Fetch(func(req *http.Request) (*http.Response, error) {
		response, err := client.DefaultFetch(req)
		if err == nil && !failed && req.URL.Path == "/v1/swap" {
			failed = true
			response.Body.Close()
			return nil, io.ErrUnexpectedEOF
		}
		return response, err
	})
	_, err := admin.ReplaceKit(f.ctx, f.a, "old password", f.now, func(admin.ReplacementKit) error { shown++; return nil }, fetch, nil)
	if err == nil || shown != 1 {
		t.Fatal("expected lost response after showing kit", shown, err)
	}
	pending := filepath.Join(f.a.Home, "state", "kit-replace")
	if _, err = os.Stat(pending); err != nil {
		t.Fatal(err)
	}
	result, err := admin.ReplaceKit(f.ctx, f.a, "old password", f.now, func(admin.ReplacementKit) error { t.Fatal("settled replacement must not show another kit"); return nil }, f.a.Fetcher, nil)
	if err != nil || result.Kind != "finished" {
		t.Fatal(result, err)
	}
	if _, err = os.Stat(pending); !os.IsNotExist(err) {
		t.Fatal("pending kit was not cleared", err)
	}
}
