package onboarding

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/admin/rejoin/classify"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/pairing"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/pairing"
	"io"
	"path/filepath"
	"strconv"
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

func pairingJoin(ctx context.Context, a contracts.Adapters, address string, o JoinOptions, prompts Prompts, stdout io.Writer, pause func(context.Context) error) error {
	namespace := a.Home
	if o.Rejoin {
		namespace += "/rejoin"
	}
	var expected []byte
	var ident identity.Identity
	var selectedName string
	if !o.Resume {
		var err error
		selectedName, err = askName(o.Name, a.Hostname, prompts)
		if err != nil {
			return err
		}
	}
	if o.Resume {
		key, err := a.Keychain.Get("envden/"+a.Home+"/pair-receive", false)
		if err != nil {
			return err
		}
		if key == nil {
			return errors.New(errors.NotFound, "No pairing exchange to resume")
		}
		clear(key)
		saved, err := files.OptionalRead(filepath.Join(a.Home, "state", "pair-pin"))
		if err != nil {
			return err
		}
		if saved != nil {
			expected, err = client.Binary(*saved)
			if err != nil {
				return err
			}
		}
	} else {
		if err := persistence.ClearJoiner(a); err != nil {
			return err
		}
	}
	server, err := client.Hello(ctx, address, expected, a.Fetcher, "")
	if err != nil {
		return err
	}
	if o.Resume {
		raw, err := a.Keychain.Get("envden/"+namespace+"/device", false)
		if err != nil {
			return err
		}
		if raw == nil {
			return errors.New(errors.NotFound, "No pairing exchange to resume")
		}
		ident, err = identity.ReadIdentity(raw)
		if err != nil {
			return err
		}
	} else {
		local, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}
		if o.Rejoin {
			ident, err = classify.RejoinIdentity(ctx, a, selectedName)
		} else {
			ident, err = identity.DeviceIdentity(ctx, a.Keychain, a.Home, selectedName, local == nil || local.Checkpoint == "", a.Timing)
		}
		if err != nil {
			return err
		}
	}
	cl := client.CreateClient(client.Options{HelloCache: a.HelloCache, Address: address, Pin: server.Pin, VaultID: make([]byte, 32), Identity: ident, Now: a.Now, Fetcher: a.Fetcher, Version: version.Version})
	if !o.Resume {
		if err = files.AtomicWrite(filepath.Join(a.Home, "state", "pair-pin"), []byte(client.Text(server.Pin)), a.Now); err != nil {
			return err
		}
		code, err := prompts.Input("Pairing code", "", true, func(v string) string {
			_, err := p.NormalizePairingCode(v)
			if err != nil {
				return err.Error()
			}
			return ""
		})
		if err != nil {
			return err
		}
		normalized, err := p.NormalizePairingCode(code)
		if err != nil {
			return err
		}
		err = pairing.ExchangeJoiner(ctx, a, cl, ident, server.Pin, code, func(serverExpiry int64) error {
			expiry := min(serverExpiry, a.Now()+600000)
			if err := files.AtomicWrite(filepath.Join(a.Home, "state", "pair-expiry"), []byte(strconv.FormatInt(expiry, 10)), a.Now); err != nil {
				return err
			}
			_, err := pairing.WaitMessage(ctx, cl, fmt.Sprintf("/v1/pairing/mailboxes/%d/KE2", normalized.Mailbox), a.Now, expiry, pause)
			return err
		})
		if err != nil {
			return err
		}
		fmt.Fprintln(stdout, "Waiting for the approving device")
	}
	_, err = pairing.FinishPairing(ctx, a, cl, ident, address, server.Pin, a.Now, pause, o.Rejoin)
	return err
}
