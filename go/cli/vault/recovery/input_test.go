package recovery

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func TestRecoveryInput(t *testing.T) {
	id := encoding.Base32(bytes.Repeat([]byte{3}, 32))
	secret, err := keys.EncodeSecretKey(bytes.Repeat([]byte{5}, 16))
	if err != nil {
		t.Fatal(err)
	}

	for _, text := range []string{"# kit", "{}", `{"vaultId":"v","secretKey":"` + secret + `"}`, `{"vaultId":"` + id + `","secretKey":"EK1-AAAAA"}`} {
		if _, err := ParseKit(text); !errors.Is(err, errors.InvalidInput) {
			t.Fatal(text, err)
		}
	}

	got, err := ParseKit(`{"vaultId":"` + id + `","secretKey":"` + secret + `","server":"local"}`)
	if err != nil || got.VaultID != id || got.SecretKey != secret {
		t.Fatal(got, err)
	}

	if SecretKeyProblem(" "+strings.ToLower(secret)+" ") != "" || VaultIDProblem(id) != "" {
		t.Fatal("valid kit rejected")
	}

	if SecretKeyProblem(id) == "" || VaultIDProblem(secret) == "" {
		t.Fatal("invalid kit accepted")
	}
}

func TestKitOutput(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kit.json")
	kit := vault.SetupKit{SecretKey: "secret<&", VaultID: "vault", Server: "local", MasterPassword: "________________"}
	if err := WriteKit(path, kit); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	expected := "{\n  \"secretKey\": \"secret<&\",\n  \"vaultId\": \"vault\",\n  \"server\": \"local\",\n  \"masterPassword\": \"________________\"\n}"
	if string(raw) != expected {
		t.Fatal(string(raw))
	}

	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal(info, err)
	}

	if err = WriteKit(path, struct{}{}); !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}

	if err = WriteKit(filepath.Join(dir, "missing", "kit.json"), kit); !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}

	again, _ := os.ReadFile(path)
	if !bytes.Equal(raw, again) {
		t.Fatal("existing kit overwritten")
	}
}
