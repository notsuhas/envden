package enginetest

import (
	"bytes"
	"fmt"
	"os"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/core/adapters"
	fakekeychain "github.com/notsuhas/envden/go/testing/keychain"
)

type testContext interface {
	Helper()
	Fatal(...any)
	Fatalf(string, ...any)
	TempDir() string
	Cleanup(func())
}

type fixtureOwner struct{ cleanups []func() }

func (*fixtureOwner) Helper() {}

func (*fixtureOwner) Fatal(v ...any) { panic(fmt.Sprint(v...)) }

func (*fixtureOwner) Fatalf(format string, v ...any) { panic(fmt.Sprintf(format, v...)) }

func (o *fixtureOwner) TempDir() string {
	root, err := os.MkdirTemp("", "envden-sync-tests-")
	if err != nil {
		panic(err)
	}

	o.Cleanup(func() {
		if err := os.RemoveAll(root); err != nil {
			panic(err)
		}
	})

	return root
}

func (o *fixtureOwner) Cleanup(fn func()) { o.cleanups = append(o.cleanups, fn) }

func (o *fixtureOwner) close() {
	for i := len(o.cleanups) - 1; i >= 0; i-- {
		o.cleanups[i]()
	}
}

type sharedFixture struct {
	fixture  *fixture
	snapshot *snapshot
	adapters [3]contracts.Adapters
}

var shared sharedFixture

func TestMain(m *testing.M) {
	if os.Getenv("ENVDEN_SYNC_LOCK_CHILD") != "" {
		os.Exit(m.Run())
	}

	owner := &fixtureOwner{}
	f := createFixture(owner)
	shared = sharedFixture{f, takeSnapshot(owner, f.root), [3]contracts.Adapters{f.first, f.second, f.third}}
	code := m.Run()
	owner.close()
	os.Exit(code)
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	shared.snapshot.restore(t)
	f := *shared.fixture
	f.t = t
	devices := []*contracts.Adapters{&f.first, &f.second, &f.third}

	for i, a := range devices {
		*a = shared.adapters[i]
		a.Keychain = a.Keychain.(*memoryKeychain).clone()
		a.HelloCache = client.NewHelloCache()
	}

	return &f
}

type memoryKeychain struct {
	adapters.Keychain
	values map[string][]byte
}

func newMemoryKeychain(values map[string][]byte) *memoryKeychain {
	copied := map[string][]byte{}

	for k, v := range values {
		copied[k] = bytes.Clone(v)
	}

	k := &memoryKeychain{values: copied}
	k.Keychain = fakekeychain.CreateFakeKeychainAdapter(fakekeychain.Operations{
		OwnerOnly: func() (bool, error) { return true, nil },
		Get:       func(name string, _ bool) ([]byte, error) { return bytes.Clone(k.values[name]), nil },
		Set:       func(name string, value []byte) error { k.values[name] = bytes.Clone(value); return nil },
		Delete:    func(name string) error { delete(k.values, name); return nil },
	})

	return k
}

func (k *memoryKeychain) clone() *memoryKeychain { return newMemoryKeychain(k.values) }
