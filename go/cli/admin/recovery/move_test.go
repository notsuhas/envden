package recovery_test

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestMoveAndResume(t *testing.T) {
	for _, action := range []string{"move", "resume", "abort"} {
		t.Run(action, func(t *testing.T) {
			f := newFixture(t, true)
			address, token, _ := testServer(t, f.now)
			failed := false
			fetch := client.Fetch(func(req *http.Request) (*http.Response, error) {
				boundary := "/v1/swap"
				if action == "abort" {
					boundary = "/v1/move/chain"
				}

				if action != "move" && !failed && strings.HasPrefix(req.URL.String(), address) && req.URL.Path == boundary {
					failed = true

					return &http.Response{StatusCode: 401, Header: http.Header{}, Body: io.NopCloser(bytes.NewBufferString(`{"error":"UNAUTHORIZED"}`))}, nil
				}

				return client.DefaultFetch(req)
			})
			err := move.MoveServer(f.ctx, f.a, move.Options{Address: address, Token: token, Password: "old password", Now: f.now, Fetcher: fetch})
			if action != "move" {
				if !errors.Is(err, errors.Unauthorized) {
					t.Fatal("expected interruption", err)
				}

				err = move.MoveServer(f.ctx, f.a, move.Options{Resume: action == "resume", Abort: action == "abort", Password: "old password", Now: f.now, Fetcher: fetch})
			}

			if err != nil {
				t.Fatal(err)
			}

			ds, err := devices.ListDevices(f.ctx, f.a, f.now, f.a.Fetcher)
			if err != nil || len(ds) != 2 {
				t.Fatal(ds, err)
			}

			if action != "abort" {
				if err = move.SwitchServer(f.ctx, f.b, address, f.now, f.b.Fetcher); !errors.Is(err, errors.Locked) {
					t.Fatal("TS switch must require destination unlock", err)
				}
			}
		})
	}
}
