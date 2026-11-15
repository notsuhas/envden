package onboarding

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/pairing"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault/recovery"
)

type JoinOptions struct {
	Preferences
	RecoveryKit, Name        string
	Recovery, Resume, Rejoin bool
}

type JoinEffects struct {
	Effects
	FirstRun func(context.Context, contracts.Adapters) error
	Pause    func(context.Context) error
}

func RunJoin(ctx context.Context, a contracts.Adapters, address string, o JoinOptions, prompts Prompts, stdout io.Writer, e JoinEffects) (*model.State, error) {
	if err := JoinVault(ctx, a, address, o, prompts, stdout, e); err != nil {
		return nil, err
	}

	return CompleteJoin(ctx, a, o.Preferences, prompts, e)
}

func JoinVault(ctx context.Context, a contracts.Adapters, address string, o JoinOptions, prompts Prompts, stdout io.Writer, e JoinEffects) error {
	if err := pairing.RefuseCommittedJoin(a, o.Rejoin); err != nil {
		return err
	}

	if o.Recovery || o.RecoveryKit != "" {
		name, err := askName(o.Name, a.Hostname, prompts)
		if err != nil {
			return err
		}

		kit, err := recovery.ReadKit(o.RecoveryKit, prompts.Secret, prompts.Input)
		if err != nil {
			return err
		}

		password, err := prompts.Secret("Master password", nil)
		if err != nil {
			return err
		}

		if _, err = recovery.KitJoin(ctx, a, recovery.JoinOptions{Rejoin: o.Rejoin, Address: address, VaultID: kit.VaultID, SecretKey: kit.SecretKey, Password: password, Name: name, Now: a.Now}); err != nil {
			return err
		}
	} else {
		if err := pairingJoin(ctx, a, address, o, prompts, stdout, e.Pause); err != nil {
			return err
		}
	}

	return nil
}

func CompleteJoin(ctx context.Context, a contracts.Adapters, o Preferences, prompts Prompts, e JoinEffects) (*model.State, error) {
	configured, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}

	configured, err = state.RequireConfigured(configured)
	if err != nil {
		return nil, err
	}

	if err = SetupPreferences(ctx, a, o, prompts, e.InstallAgent); err != nil {
		return nil, err
	}

	if e.Checkouts != nil {
		if err = e.Checkouts(ctx, a, configured, SetupOptions{}); err != nil {
			return nil, err
		}
	}

	if e.FirstRun != nil {
		if err = e.FirstRun(ctx, a); err != nil {
			return nil, err
		}
	}

	configured, err = store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}

	return state.RequireConfigured(configured)
}
