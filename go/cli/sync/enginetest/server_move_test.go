package enginetest

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/session"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	recoveryjoin "github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestServerMoveAndOfflinePull(t *testing.T) {
	for _, crash := range []bool{false, true} {
		t.Run(fmt.Sprintf("crash=%t", crash), func(t *testing.T) {
			f := createConfiguredFixture(t, fixtureOptions{devices: 2, bare: true, password: "old password"})
			destination, token := f.serve(filepath.Join(f.root, "destination"), false)
			failed := false
			fetch := func(req *http.Request) (*http.Response, error) {
				if crash && !failed && strings.HasPrefix(req.URL.String(), destination.URL) && req.URL.Path == "/v1/swap" {
					failed = true
					return nil, fmt.Errorf("injected connection loss")
				}
				return client.DefaultFetch(req)
			}
			err := move.MoveServer(f.ctx, f.first, move.Options{Address: destination.URL, Token: token, Password: "old password", Now: clock, Fetcher: fetch})
			if crash {
				if err == nil || !failed {
					t.Fatal("move must stop after source commit", err, failed)
				}
				err = move.MoveServer(f.ctx, f.first, move.Options{Abort: true, Password: "old password", Now: clock, Fetcher: client.DefaultFetch})
				if !errors.Is(err, errors.Moving) {
					t.Fatal("committed move must refuse abort", err)
				}
				opts := f.opts
				opts.Fetcher = client.DefaultFetch
				opts.Unlock = func(ctx context.Context, c *client.Client, vault []byte) error {
					_, err := session.Login(ctx, c, vault, session.Password{Value: "old password"}, "")
					return err
				}
				_, err = syncer.Pull(f.ctx, f.second, opts)
				must(t, err)
				equal(t, f.state(f.second).Server.Address, destination.URL)
				must(t, move.MoveServer(f.ctx, f.first, move.Options{Resume: true, Password: "old password", Now: clock, Fetcher: client.DefaultFetch}))
			} else {
				must(t, err)
			}
			equal(t, f.state(f.first).Server.Address, destination.URL)
			_, err = os.Stat(filepath.Join(f.first.Home, "state", "move-pin"))
			if !os.IsNotExist(err) {
				t.Fatal("move pin must be cleared", err)
			}
			_, err = recoveryjoin.KitJoin(f.ctx, f.home("after-move"), recoveryjoin.JoinOptions{Address: destination.URL, VaultID: f.kit.VaultID, SecretKey: f.kit.SecretKey, Password: "old password", Name: "after-move", Now: clock})
			must(t, err)
		})
	}
}
