package enginetest

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"

	placementfs "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	syncer "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/initial"
	"github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/cli/vault/setup"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/server"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

const original = "TOKEN=local-test-value\n"

type fixture struct {
	running              *server.Running
	kit                  vault.SetupKit
	t                    testContext
	ctx                  context.Context
	root, aStore         string
	first, second, third contracts.Adapters
	checkout, checkoutB  adapters.Checkout
	opts                 syncer.Options
	setup                setup.Options
}

func must(t testContext, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func equal[T comparable](t testContext, got, want T) {
	t.Helper()

	if got != want {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func clock() int64 { return 1800000000000 }

type fixtureOptions struct {
	devices  int
	bare     bool
	password string
}

func createFixture(t testContext) *fixture {
	return createConfiguredFixture(t, fixtureOptions{devices: 3, password: "master password"})
}

func createConfiguredFixture(t testContext, options fixtureOptions) *fixture {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	must(t, err)
	f := &fixture{t: t, ctx: context.Background(), root: root, opts: syncer.Options{Now: clock, Yes: true, All: true}}
	var stdout bytes.Buffer
	port := 0
	running, err := server.Serve(server.ServeOptions{DataDir: filepath.Join(root, "server"), Port: &port, Now: clock, Stdout: &stdout, Stderr: io.Discard})
	must(t, err)
	t.Cleanup(func() { must(t, running.Shutdown()) })
	f.running = running
	create := func(name string) contracts.Adapters {
		home := filepath.Join(root, name)
		a := contracts.Adapters{Home: home, UserHome: home, Hostname: name, Now: clock, Timing: lock.Timing{Now: clock}, Fetcher: client.DefaultFetch, HelloCache: client.NewHelloCache(), Keychain: newMemoryKeychain(nil)}
		a.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
			return prepared{placementfs.CreateFsPlacementAdapter(mode, root, filepath.Join(home, "conflicts"), clock)}
		}

		return a
	}
	f.first, f.second, f.third = create("first"), create("second"), create("third")
	f.setup = setup.Options{Address: strings.TrimSuffix(running.URL, "/"), Token: strings.TrimSpace(strings.Split(stdout.String(), "\n")[1]), Name: "first", Password: options.password, Now: clock}
	result, err := setup.SetupVault(f.ctx, f.first, f.setup)
	must(t, err)
	f.setup.ResumeSecretKey = result.Kit.SecretKey
	f.kit = result.Kit
	f.checkout = adapters.Checkout{Root: filepath.Join(root, "checkout"), GitDir: filepath.Join(root, "checkout", ".git"), RepoID: "github.com/example/project"}
	f.checkoutB = f.checkout
	f.checkoutB.Root = filepath.Join(root, "checkout-b")
	f.checkoutB.GitDir = filepath.Join(f.checkoutB.Root, ".git")
	f.repo(&f.first, []adapters.Checkout{f.checkout}, ".env")

	if !options.bare {
		f.write(filepath.Join(f.checkout.Root, ".env"), original)
		_, err = place.LinkCheckout(f.ctx, f.first, result.State, f.checkout, place.LinkOptions{Approve: func(adapters.Checkout) (bool, error) { return true, nil }})
		must(t, err)
		must(t, initial.PushInitialFiles(f.ctx, f.first, result.State, nil, nil))
		f.aStore = result.State.Links[0].Store
	}

	for i, a := range []*contracts.Adapters{&f.second, &f.third} {
		if i+2 > options.devices {
			break
		}

		_, err = recovery.KitJoin(f.ctx, *a, recovery.JoinOptions{Address: f.setup.Address, VaultID: result.Kit.VaultID, SecretKey: result.Kit.SecretKey, Password: options.password, Name: []string{"second", "third"}[i], Now: clock})
		must(t, err)
		f.repo(a, []adapters.Checkout{f.checkoutB}, ".env")
	}

	must(t, os.MkdirAll(f.checkoutB.Root, 0700))

	if !options.bare {
		s := f.state(f.second)
		s.Approved = append(s.Approved, checkout.ApprovalRecord(f.checkoutB))
		f.save(f.second, s)
	}

	return f
}

func (f *fixture) repo(a *contracts.Adapters, checkouts []adapters.Checkout, paths ...string) {
	a.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{
		CheckoutAt: func(root string) (*adapters.Checkout, error) {
			for _, c := range checkouts {
				if root == c.Root || strings.HasPrefix(root, c.Root+string(os.PathSeparator)) {
					return &c, nil
				}
			}

			return nil, nil
		},
		CaseInsensitive: func(string, bool) (bool, error) { return false, nil },
		EnsureIgnored:   func(adapters.Checkout, string) error { return nil },
		EnvFiles:        func(adapters.Checkout, *adapters.EnvFileRules) ([]string, error) { return paths, nil },
		Worktrees:       func(adapters.Checkout) ([]string, error) { return nil, nil },
	})
}

func (f *fixture) state(a contracts.Adapters) *state.State {
	f.t.Helper()
	s, err := store.LoadState(a.Home)
	must(f.t, err)

	if s == nil {
		f.t.Fatal("missing state")
	}

	return s
}

func (f *fixture) save(a contracts.Adapters, s *state.State) {
	f.t.Helper()

	if s.Links == nil {
		s.Links = []state.Link{}
	}

	if s.Approved == nil {
		s.Approved = []state.Checkout{}
	}

	must(f.t, store.SaveState(f.ctx, a.Home, s, a.Timing))
}

func (f *fixture) write(path, value string) {
	f.t.Helper()
	must(f.t, statefiles.AtomicWrite(path, []byte(value), clock))
}

func (f *fixture) read(path string) string {
	f.t.Helper()
	b, err := os.ReadFile(path)
	must(f.t, err)

	return string(b)
}

func (f *fixture) pull(a contracts.Adapters) syncer.Result {
	f.t.Helper()
	r, err := syncer.Pull(f.ctx, a, f.opts)
	must(f.t, err)

	return r
}

func (f *fixture) push(a contracts.Adapters) syncer.Result {
	f.t.Helper()
	r, err := syncer.Push(f.ctx, a, f.opts)
	must(f.t, err)

	return r
}

func (f *fixture) remove(a contracts.Adapters, path string) {
	f.t.Helper()
	_, err := syncer.RemoveFile(f.ctx, a, path, syncer.RemoveOptions{Yes: true, Now: clock})
	must(f.t, err)
}

func (f *fixture) resolve(a contracts.Adapters, path, choice string) {
	f.t.Helper()
	_, err := syncer.ResolveConflict(f.ctx, a, syncer.ResolveOptions{File: path, Choice: choice, Now: clock})
	must(f.t, err)
}

type prepared struct{ adapters.Placement }

func (p prepared) Place(store, dest string, prepare func(string) error, replacing *string) error {
	if prepare == nil {
		prepare = func(string) error { return nil }
	}

	return p.Placement.Place(store, dest, prepare, replacing)
}
