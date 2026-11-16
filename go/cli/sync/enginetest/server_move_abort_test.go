package enginetest

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

func TestPreparedMoveAbortAllowsFreshMove(t *testing.T) {
	f := createConfiguredFixture(t, fixtureOptions{devices: 1, bare: true, password: "old password"})
	destination, token := f.serve(filepath.Join(f.root, "abort-destination"), false)
	stopped := false
	fetch := func(req *http.Request) (*http.Response, error) {
		if strings.HasPrefix(req.URL.String(), f.kit.Server) && req.URL.Path == "/v1/swap" {
			stopped = true

			return nil, fmt.Errorf("crash before source commit")
		}

		return client.DefaultFetch(req)
	}
	err := move.MoveServer(f.ctx, f.first, move.Options{Address: destination.URL, Token: token, Password: "old password", Now: clock, Fetcher: fetch})
	if err == nil || !stopped {
		t.Fatal("move must stop before source commit", err, stopped)
	}

	must(t, move.MoveServer(f.ctx, f.first, move.Options{Abort: true, Password: "old password", Now: clock, Fetcher: client.DefaultFetch}))
	setup, err := destination.Storage.SetupToken()
	must(t, err)

	if setup != nil {
		t.Fatal("destination setup token must be discarded")
	}

	decoded, err := proofs.DecodeToken("setup", token)
	must(t, err)
	key, err := proofs.TokenKey("setup", decoded.Secret)
	must(t, err)
	must(t, destination.Storage.SetSetupToken(key))
	must(t, move.MoveServer(f.ctx, f.first, move.Options{Address: destination.URL, Token: token, Password: "old password", Now: clock, Fetcher: client.DefaultFetch}))
	equal(t, f.state(f.first).Server.Address, destination.URL)
	_, err = os.Stat(filepath.Join(f.first.Home, "state", "move-pin"))

	if !os.IsNotExist(err) {
		t.Fatal("move pin must be cleared", err)
	}
}

func TestStaleKitRefusesMoveWithoutConsumingToken(t *testing.T) {
	f := createConfiguredFixture(t, fixtureOptions{devices: 1, bare: true, password: "old password"})
	destination, token := f.serve(filepath.Join(f.root, "refused-destination"), false)
	ids, err := f.running.Storage.VaultIDs()
	must(t, err)
	v, err := f.running.Storage.Vault(ids[0])
	must(t, err)
	v.SKRefused = true
	must(t, f.running.Storage.ConfigureVault(ids[0], *v, nil, nil))
	before, err := destination.Storage.SetupToken()
	must(t, err)
	err = move.MoveServer(f.ctx, f.first, move.Options{Address: destination.URL, Token: token, Password: "old password", Now: clock, Fetcher: client.DefaultFetch})

	if !errors.Is(err, errors.RecoveryKitRequired) {
		t.Fatal(err)
	}

	after, err := destination.Storage.SetupToken()
	must(t, err)
	equal(t, bytes.Equal(after, before), true)
	destIDs, err := destination.Storage.VaultIDs()
	must(t, err)
	equal(t, len(destIDs), 0)
	v, err = f.running.Storage.Vault(ids[0])
	must(t, err)
	equal(t, v.Frozen, false)
}
