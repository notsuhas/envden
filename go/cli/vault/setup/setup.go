package setup

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/version"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

type Options struct {
	Address, Token, Name, Password, ResumeSecretKey string
	Now                                             func() int64
	ReadResumeSecretKey                             func() (string, error)
	OnKit                                           func(vault.SetupKit) error
	ReplaceLostKit                                  func(context.Context) (*model.State, vault.SetupKit, error)
}

type Result struct {
	State *model.State
	Kit   vault.SetupKit
}

func SetupVault(ctx context.Context, a contracts.Adapters, o Options) (Result, error) {
	var result Result
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error { var err error; result, err = lockedSetup(ctx, a, o); return err })
	return result, err
}

func lockedSetup(ctx context.Context, a contracts.Adapters, o Options) (Result, error) {
	existing, err := store.LoadState(a.Home)
	if err != nil {
		return Result{}, err
	}
	if existing != nil && existing.VaultID != "" && existing.CreationPending == "" {
		kit, err := ResumedKit(existing, o.Address, o.ResumeSecretKey)
		return Result{existing, kit}, err
	}
	token, err := proofs.DecodeToken("setup", o.Token)
	if err != nil {
		return Result{}, err
	}
	if _, err = client.Hello(ctx, o.Address, token.ServerPin, a.Fetcher, version.MinServer); err != nil {
		return Result{}, err
	}
	ident, err := identity.DeviceIdentity(ctx, a.Keychain, a.Home, o.Name, false, a.Timing)
	if err != nil {
		return Result{}, err
	}
	proofKey, err := proofs.TokenKey("setup", token.Secret)
	if err != nil {
		return Result{}, err
	}
	options := client.Options{HelloCache: a.HelloCache, Address: o.Address, Pin: token.ServerPin, Identity: ident, Version: version.Version, Now: o.Now, Fetcher: a.Fetcher, Proof: func(r s.Request) ([]byte, error) { return proofs.TokenProof("setup", proofKey, r) }}
	if existing != nil && existing.CreationPending != "" && existing.VaultID != "" && existing.Server != nil {
		resumed, err := resumeCreation(ctx, a, o, options, existing, ident.Record.Id)
		if err != nil || resumed != nil {
			if resumed != nil {
				return *resumed, err
			}
			return Result{}, err
		}
	}
	material, err := vault.CreateGenesis(ident, token.ServerPin, o.Now())
	if err != nil {
		return Result{}, err
	}
	defer clear(material.RecoveryKeys.EncSk)
	defer clear(material.RecoveryKeys.ObjSk)
	state := model.EmptyState(o.Name)
	state.VaultID = b.Base32(material.VaultID)
	state.Touch("vaultId")
	state.Server = &model.Server{Address: o.Address, Pin: client.Text(token.ServerPin), Protocol: 1}
	state.Touch("server")
	for _, entry := range []b.Signed[p.Entry]{material.Genesis, material.Epoch} {
		raw, err := b.Encode(p.SignedCodec(p.EntryCodec), entry)
		if err != nil {
			return Result{}, err
		}
		state.Entries = append(state.Entries, client.Text(raw))
	}
	state.Keyring = client.Text(material.Keyring)
	state.Touch("keyring")
	options.VaultID = material.VaultID
	cl := client.CreateClient(options)
	record, err := session.RegisterPassword(ctx, cl, material.VaultID, o.Password)
	if err != nil {
		return Result{}, err
	}
	swap, kit, err := vault.CreateVaultSwap(material, ident, o.Password, record, o.Now())
	if err != nil {
		return Result{}, err
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		return Result{}, err
	}
	state.CreationPending = client.Text(raw)
	state.Touch("creationPending")
	kit.Server = o.Address
	kit.MasterPassword = "________________"
	if o.OnKit != nil {
		if err = o.OnKit(kit); err != nil {
			return Result{}, err
		}
	}
	header, err := b.Encode(p.SignedCodec(m.ManifestHeaderCodec), swap.Header)
	if err != nil {
		return Result{}, err
	}
	state.Headers = []string{client.Text(header)}
	files, err := b.Encode(m.FilesCodec, *swap.Files)
	if err != nil {
		return Result{}, err
	}
	state.Files = client.Text(files)
	state.Touch("files")
	hash, err := c.ObjectHash(m.ManifestHeaderCodec, swap.Header, "manifest")
	if err != nil {
		return Result{}, err
	}
	state.Checkpoint = client.Text(hash)
	state.Touch("checkpoint")
	if err = a.Keychain.Set("envden/"+a.Home+"/epoch/1", material.EpochKey); err != nil {
		return Result{}, err
	}
	if err = a.Keychain.Set("envden/"+a.Home+"/id-key", material.IDKey); err != nil {
		return Result{}, err
	}
	if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
		return Result{}, err
	}
	response, err := cl.Request(ctx, "/v1/vault", "POST", raw)
	if err != nil {
		return Result{}, err
	}
	response.Body.Close()
	state.CreationPending = ""
	if err = session.RecordUnlockWindow(ctx, cl, state); err != nil {
		return Result{}, err
	}
	if state.Session != nil {
		state.Touch("session")
	}
	err = store.SaveState(ctx, a.Home, state, a.Timing)
	return Result{state, kit}, err
}
