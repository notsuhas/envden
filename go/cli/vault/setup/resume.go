package setup

import (
	"context"

	admin "github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func ResumedKit(state *model.State, address, secretKey string) (vault.SetupKit, error) {
	if secretKey == "" {
		return vault.SetupKit{}, errors.New(errors.InvalidInput, "Resume setup with the recovery kit issued before creation")
	}

	secret, err := keys.DecodeSecretKey(secretKey)
	if err != nil {
		return vault.SetupKit{}, err
	}

	if state.CreationPending != "" {
		raw, err := client.Binary(state.CreationPending)
		if err != nil {
			return vault.SetupKit{}, err
		}

		swap, err := encoding.Decode(manifests.SwapCodec, raw)
		if err != nil {
			return vault.SetupKit{}, err
		}

		id, err := encoding.Unbase32(state.VaultID)
		if err != nil {
			return vault.SetupKit{}, err
		}

		pub, err := keys.SKPub(secret, id)
		if err != nil {
			return vault.SetupKit{}, err
		}

		if swap.SkPub == nil || !encoding.Equal(pub, *swap.SkPub) {
			return vault.SetupKit{}, errors.New(errors.InvalidInput, "Recovery kit does not match pending vault")
		}
	}

	return vault.SetupKit{SecretKey: secretKey, VaultID: state.VaultID, Server: address, MasterPassword: "________________"}, nil
}

func resumeCreation(ctx context.Context, a contracts.Adapters, o Options, options client.Options, state *model.State, deviceID []byte) (*Result, error) {
	epoch, err := a.Keychain.Get("envden/"+a.Home+"/epoch/1", false)
	if err != nil {
		return nil, err
	}

	idKey, err := a.Keychain.Get("envden/"+a.Home+"/id-key", false)
	if err != nil {
		return nil, err
	}

	if epoch == nil || idKey == nil {
		return nil, nil
	}

	raw, err := client.Binary(state.CreationPending)
	if err != nil {
		return nil, err
	}

	swap, err := encoding.Decode(manifests.SwapCodec, raw)
	if err != nil {
		return nil, err
	}

	id, err := encoding.Unbase32(state.VaultID)
	if err != nil {
		return nil, err
	}

	matches := false
	for _, entry := range swap.Entries {
		if entry.Body.Kind == 3 {
			change := entry.Body.Payload.(entrypayloads.NewEpoch).Change
			commit, err := epochs.KeyCommit(epoch, id, 1)
			if err != nil {
				return nil, err
			}

			matches = encoding.Equal(swap.Header.Body.Signer, deviceID) && encoding.Equal(commit, change.KeyCommit)
			break
		}
	}

	if !matches {
		return nil, nil
	}

	secret := o.ResumeSecretKey
	if secret == "" && o.ReadResumeSecretKey != nil {
		secret, err = o.ReadResumeSecretKey()
		if err != nil {
			return nil, err
		}
	}

	var kit vault.SetupKit
	if secret != "" {
		kit, err = ResumedKit(state, o.Address, secret)
		if err != nil {
			return nil, err
		}
	}

	options.Address = state.Server.Address
	options.VaultID = id
	cl := client.CreateClient(options)
	response, err := cl.Request(ctx, "/v1/vault", "POST", raw)
	if errors.Is(err, errors.Unauthorized) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	state.CreationPending = ""
	if err = session.RecordUnlockWindow(ctx, cl, state); err != nil {
		return nil, err
	}

	if state.Session != nil {
		state.Touch("session")
	}

	if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
		return nil, err
	}

	if secret != "" {
		return &Result{state, kit}, nil
	}

	if o.ReplaceLostKit != nil {
		s, k, err := o.ReplaceLostKit(ctx)

		return &Result{s, k}, err
	}

	replacement, err := admin.ReplaceKit(ctx, a, o.Password, o.Now, func(kit admin.ReplacementKit) error {
		if o.OnKit == nil {
			return nil
		}

		return o.OnKit(vault.SetupKit{SecretKey: kit.SecretKey, VaultID: kit.VaultID, Server: kit.Server, MasterPassword: "________________"})
	}, a.Fetcher, nil)
	if err != nil {
		return nil, errors.Wrap(errors.RecoveryKitRequired, "Vault created without a recovery kit; run envden vault kit replace", err)
	}

	if replacement.Kind != "replaced" || replacement.Kit == nil {
		return nil, errors.New(errors.RecoveryKitRequired, "Vault created without a recovery kit; run envden vault kit replace")
	}

	latest, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}

	replacementKit := replacement.Kit

	return &Result{latest, vault.SetupKit{SecretKey: replacementKit.SecretKey, VaultID: replacementKit.VaultID, Server: replacementKit.Server, MasterPassword: "________________"}}, nil
}
