package identity

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"github.com/notsuhas/envden/go/testing/storage/memory"
)

func TestPrivateIdentityPersists(t *testing.T) {
	dir := t.TempDir()
	first, err := LoadServerKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(dir, 0755); err != nil { //nolint:gosec // G302: fixture tests restriction of existing public storage permissions.
		t.Fatal(err)
	}
	path := filepath.Join(dir, "identity.json")
	if err = os.Chmod(path, 0644); err != nil { //nolint:gosec // G302: fixture tests restriction of existing public storage permissions.
		t.Fatal(err)
	}
	second, err := LoadServerKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("identity changed")
	}
	for _, row := range []struct {
		path string
		mode os.FileMode
	}{{dir, 0700}, {path, 0600}} {
		info, err := os.Stat(row.path)
		if err != nil {
			t.Fatal(err)
		}
		if runtime.GOOS != "windows" && info.Mode().Perm() != row.mode {
			t.Fatal(row.path, info.Mode())
		}
	}
	if err = PersistIdentity(dir, []byte("{}")); err == nil {
		t.Fatal("overwrote existing identity")
	}
	again, err := LoadServerKeys(dir)
	if err != nil || !reflect.DeepEqual(first, again) {
		t.Fatal("publication damaged identity")
	}
}

func TestSetupLifecycle(t *testing.T) {
	storage := memory.CreateMemoryStorageAdapter()
	defer func() { _ = storage.Close() }()
	pub := must(keys.GenerateRecoveryKeys()).ObjPub
	pin := must(keys.ServerPin(pub))
	initial := must(InitializeSetup(storage, pub, ""))
	if initial == "" {
		t.Fatal("no setup")
	}
	first := must(storage.SetupToken())
	if token := must(InitializeSetup(storage, pub, "")); token != "" {
		t.Fatal("reissued")
	}
	replacement := must(proofs.EncodeToken("setup", crypto.RandomBytes(20), pin))
	if got := must(InitializeSetup(storage, pub, replacement)); got != replacement {
		t.Fatal(got)
	}
	if bytes.Equal(first, must(storage.SetupToken())) {
		t.Fatal("unchanged token")
	}
	wrong := must(proofs.EncodeToken("setup", crypto.RandomBytes(20), make([]byte, 32)))
	if _, err := InitializeSetup(storage, pub, wrong); err == nil {
		t.Fatal("wrong pin accepted")
	}
	id := crypto.RandomBytes(32)
	check(storage.ConfigureVault(id, adapters.StoredVault{}, nil, must(storage.SetupToken())))
	if token := must(ReissueSetup(storage, pub)); token != "" {
		t.Fatal("reissue with vault")
	}
	check(storage.DiscardInactiveVault(id))
	if token := must(InitializeSetup(storage, pub, "")); token != "" {
		t.Fatal("consumed token resurrected")
	}
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}

	return value
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}
