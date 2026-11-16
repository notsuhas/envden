package recovery_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
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
				if err = move.SwitchServer(f.ctx, f.b, address, f.now, f.b.Fetcher, nil); !errors.Is(err, errors.Locked) {
					t.Fatal("switch without a terminal must require unlock", err)
				}

				destinationOnly := client.Fetch(func(req *http.Request) (*http.Response, error) {
					if strings.HasPrefix(req.URL.String(), f.address) {
						t.Error("switch contacted the old server", req.URL)
					}

					return client.DefaultFetch(req)
				})
				prompts := 0
				unlock := func(ctx context.Context, cl *client.Client, vault []byte) (*model.Window, error) {
					return session.Login(ctx, cl, vault, session.Password{Prompt: func(bool) (string, error) { prompts++; return "old password", nil }}, "")
				}
				if err = move.SwitchServer(f.ctx, f.b, address, f.now, destinationOnly, unlock); err != nil || prompts != 1 {
					t.Fatal(prompts, err)
				}

				switched, err := store.LoadState(f.b.Home)
				if err != nil || switched.Server.Address != address || switched.Session == nil {
					t.Fatal(switched, err)
				}
			}
		})
	}
}
