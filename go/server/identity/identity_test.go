package identity

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	p "github.com/notsuhas/envden/go/core/protocol/proofs"
	x "github.com/notsuhas/envden/go/server/shared"
	memory "github.com/notsuhas/envden/go/testing/storage/memory"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestPrivateIdentityPersists(t *testing.T) {
	dir := t.TempDir()
	first, err := LoadServerKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "identity.json")
	if err = os.Chmod(path, 0644); err != nil {
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
	defer storage.Close()
	pub := x.Must(k.GenerateRecoveryKeys()).ObjPub
	pin := x.Must(k.ServerPin(pub))
	initial := x.Must(InitializeSetup(storage, pub, ""))
	if initial == "" {
		t.Fatal("no setup")
	}
	first := x.Must(storage.SetupToken())
	if token := x.Must(InitializeSetup(storage, pub, "")); token != "" {
		t.Fatal("reissued")
	}
	replacement := x.Must(p.EncodeToken("setup", c.RandomBytes(20), pin))
	if got := x.Must(InitializeSetup(storage, pub, replacement)); got != replacement {
		t.Fatal(got)
	}
	if bytes.Equal(first, x.Must(storage.SetupToken())) {
		t.Fatal("unchanged token")
	}
	wrong := x.Must(p.EncodeToken("setup", c.RandomBytes(20), make([]byte, 32)))
	if _, err := InitializeSetup(storage, pub, wrong); err == nil {
		t.Fatal("wrong pin accepted")
	}
	id := c.RandomBytes(32)
	x.Check(storage.ConfigureVault(id, a.StoredVault{}, nil, x.Must(storage.SetupToken())))
	if token := x.Must(ReissueSetup(storage, pub)); token != "" {
		t.Fatal("reissue with vault")
	}
	x.Check(storage.DiscardInactiveVault(id))
	if token := x.Must(InitializeSetup(storage, pub, "")); token != "" {
		t.Fatal("consumed token resurrected")
	}
}
