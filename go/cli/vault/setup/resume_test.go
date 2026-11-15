package setup

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/testing/keychain"
	"testing"
)

func TestResumedKitMatchesPendingVault(t *testing.T) {
	now := func() int64 { return 1800000000000 }
	ident, err := identity.DeviceIdentity(context.Background(), keychain.CreateMemoryKeychainAdapter([]string{"get", "set"}), t.TempDir(), "laptop", false, lock.Timing{Now: now})
	if err != nil {
		t.Fatal(err)
	}
	genesis, err := vault.CreateGenesis(ident, bytes.Repeat([]byte{4}, 32), now())
	if err != nil {
		t.Fatal(err)
	}
	swap, issued, err := vault.CreateVaultSwap(genesis, ident, "password", "AQ", now())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		t.Fatal(err)
	}
	state := model.EmptyState("laptop")
	state.VaultID = issued.VaultID
	state.CreationPending = client.Text(raw)
	if _, err = ResumedKit(state, "local", ""); !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}
	wrong, err := keys.EncodeSecretKey(bytes.Repeat([]byte{9}, 16))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ResumedKit(state, "local", wrong); !errors.Is(err, errors.InvalidInput) || err.Error() != "Recovery kit does not match pending vault" {
		t.Fatal(err)
	}
	kit, err := ResumedKit(state, "local", issued.SecretKey)
	if err != nil || kit.VaultID != state.VaultID || kit.SecretKey != issued.SecretKey || kit.MasterPassword != "________________" {
		t.Fatal(kit, err)
	}
}
