package recovery_test

import (
	"bytes"
	"context"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/cli/vault/setup"
	"github.com/notsuhas/envden/go/server"
	"github.com/notsuhas/envden/go/testing/keychain"
)

type fixture struct {
	server         *server.Running
	a, b           contracts.Adapters
	address, token string
	kit            vault.SetupKit
	ctx            context.Context
	now            func() int64
}

func testServer(t *testing.T, now func() int64) (string, string, *server.Running) {
	t.Helper()
	var stdout bytes.Buffer
	port := 0
	running, err := server.Serve(server.ServeOptions{DataDir: t.TempDir(), Port: &port, Now: now, Stdout: &stdout, Stderr: io.Discard})
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		if err := running.Shutdown(); err != nil {
			t.Error(err)
		}
	})
	lines := strings.Split(stdout.String(), "\n")
	if len(lines) < 2 {
		t.Fatal("missing setup token")
	}

	return strings.TrimSuffix(running.URL, "/"), strings.TrimSpace(lines[1]), running
}

func newFixture(t *testing.T, second bool) fixture {
	t.Helper()
	now := func() int64 { return 1800000000000 }
	ctx := context.Background()
	address, token, running := testServer(t, now)
	create := func(name string) contracts.Adapters {
		root := t.TempDir()

		return contracts.Adapters{Home: filepath.Join(root, ".envden"), UserHome: root, Hostname: name, Now: now, Timing: lock.Timing{Now: now}, Fetcher: client.DefaultFetch, Keychain: keychain.CreateMemoryKeychainAdapter([]string{"ownerOnly", "get", "set", "delete"})}
	}
	f := fixture{server: running, a: create("first"), b: create("second"), address: address, token: token, ctx: ctx, now: now}
	result, err := setup.SetupVault(ctx, f.a, setup.Options{Address: address, Token: token, Name: "first", Password: "old password", Now: now})
	if err != nil {
		t.Fatal(err)
	}

	f.kit = result.Kit
	if second {
		if _, err = recovery.KitJoin(ctx, f.b, recovery.JoinOptions{Address: address, VaultID: f.kit.VaultID, SecretKey: f.kit.SecretKey, Password: "old password", Name: "second", Now: now}); err != nil {
			t.Fatal(err)
		}
	}

	return f
}
