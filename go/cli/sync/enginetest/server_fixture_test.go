package enginetest

import (
	"bytes"
	"io"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"github.com/notsuhas/envden/go/server"
)

func (f *fixture) serve(directory string, restored bool) (*server.Running, string) {
	var stdout bytes.Buffer
	port := 0
	running, err := server.Serve(server.ServeOptions{DataDir: directory, Port: &port, Now: clock, Restored: restored, Stdout: &stdout, Stderr: io.Discard})
	must(f.t, err)
	f.t.Cleanup(func() { must(f.t, running.Shutdown()) })
	kind := "setup"

	if restored {
		kind = "repair"
	}

	token := ""

	for _, word := range strings.Fields(stdout.String()) {
		if proofs.IsToken(kind, word) {
			token = word
			break
		}
	}

	if token == "" && restored {
		f.t.Fatal("missing server token")
	}

	return running, token
}

func (f *fixture) home(name string) contracts.Adapters {
	home := filepath.Join(f.root, name)

	return contracts.Adapters{Home: home, UserHome: home, Hostname: name, Now: clock, Timing: lock.Timing{Now: clock}, Fetcher: client.DefaultFetch, HelloCache: client.NewHelloCache(), Keychain: newMemoryKeychain(nil), Placement: f.first.Placement}
}
