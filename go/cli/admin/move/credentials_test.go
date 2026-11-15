package move

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"path/filepath"
	"testing"
)

type memoryKeys map[string][]byte

func (k memoryKeys) ID() string                              { return "fake" }
func (k memoryKeys) OwnerOnly() (bool, error)                { return true, nil }
func (k memoryKeys) Get(name string, _ bool) ([]byte, error) { return k[name], nil }
func (k memoryKeys) Set(name string, v []byte) error         { k[name] = append([]byte{}, v...); return nil }
func (k memoryKeys) Delete(name string) error                { delete(k, name); return nil }

func TestMoveCredentials(t *testing.T) {
	home := t.TempDir()
	directory := filepath.Join(home, "state")
	a := contracts.Adapters{Home: home, Keychain: memoryKeys{}}
	if _, _, _, err := moveCredentials(a, directory, ""); !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}
	pin := make([]byte, 32)
	pin[0] = 1
	token, err := proofs.EncodeToken("setup", make([]byte, 20), pin)
	if err != nil {
		t.Fatal(err)
	}
	decoded, got, slot, err := moveCredentials(a, directory, token)
	if err != nil || decoded == nil || client.Text(got) != client.Text(pin) || slot != "envden/"+home+"/move-token" {
		t.Fatal(decoded, got, slot, err)
	}
	decoded, _, _, err = moveCredentials(a, directory, "")
	if err != nil || decoded == nil {
		t.Fatal(decoded, err)
	}
	a.Keychain.Delete(slot)
	if err = files.AtomicWrite(filepath.Join(directory, "move-pin"), []byte(client.Text(pin)), func() int64 { return 1 }); err != nil {
		t.Fatal(err)
	}
	decoded, got, _, err = moveCredentials(a, directory, "")
	if err != nil || decoded != nil || client.Text(got) != client.Text(pin) {
		t.Fatal(decoded, got, err)
	}
}
