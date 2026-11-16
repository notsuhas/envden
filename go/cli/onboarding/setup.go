package onboarding

import (
	"context"
	"fmt"
	"io"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/onboarding/host"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/cli/vault/setup"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/textcase"
)

type SetupOptions struct {
	Preferences
	Server, SetupToken, Name, KitOut string
	Command                          string
	HostServer, Verbose              bool
	ScanRoot, ExcludeRoot            []string
}

type Effects struct {
	Checkouts     func(context.Context, contracts.Adapters, *model.State, SetupOptions) error
	PushInitial   func(context.Context, contracts.Adapters, *model.State) error
	RefreshNotice func(context.Context, contracts.Adapters, *model.State) error
	ReportKit     func(vault.SetupKit, string) error
	InstallAgent  func() error
	Rehost        func(context.Context, contracts.Adapters, *model.State) error
}

func RunSetup(ctx context.Context, a contracts.Adapters, o SetupOptions, p Prompts, stdin io.Reader, stdout io.Writer, e Effects) (*model.State, error) {
	var result *model.State
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		existing, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}

		if existing != nil && existing.VaultID != "" && existing.CreationPending == "" {
			if o.HostServer {
				rehost := e.Rehost
				if rehost == nil {
					rehost = host.RehostServer
				}

				if err = rehost(ctx, a, existing); err != nil {
					return err
				}
			}

			result = existing
			if err = UpdatePreferences(ctx, a, o.Preferences, p, e.InstallAgent); err != nil {
				return err
			}
		} else {
			result, err = createState(ctx, a, o, p, stdin, stdout, e, existing)
			if err != nil {
				return err
			}
		}

		if e.Checkouts != nil {
			if err = e.Checkouts(ctx, a, result, o); err != nil {
				return err
			}
		}

		if e.PushInitial != nil {
			if err = e.PushInitial(ctx, a, result); err != nil {
				return err
			}
		}

		if e.RefreshNotice != nil {
			return e.RefreshNotice(ctx, a, result)
		}

		return nil
	})

	return result, err
}

func createState(ctx context.Context, a contracts.Adapters, o SetupOptions, p Prompts, stdin io.Reader, stdout io.Writer, e Effects, existing *model.State) (*model.State, error) {
	address, hostedToken, hosted, err := hostLocally(a, o, p, stdout)
	if err != nil {
		return nil, err
	}

	if o.Server != "" {
		address = o.Server
	}

	if address == "" {
		address, err = p.Input("Server address", "", true, AddressProblem)
		if err != nil {
			return nil, err
		}
	}

	address, err = RequireServerAddress(address)
	if err != nil {
		return nil, err
	}

	token := hostedToken
	if token == "" {
		token, err = readToken(o.SetupToken, p, stdin)
		if err != nil {
			return nil, err
		}
	}

	if !hosted {
		if err = checkServer(ctx, a, address, token); err != nil {
			return nil, err
		}
	}

	deviceName, err := askName(o.Name, a.Hostname, p)
	if err != nil {
		return nil, err
	}

	attempts := 1
	if p.Interactive {
		attempts = 3
	}

	password, err := ConfirmedPassword(func(label string) (string, error) { return p.Secret(label, nil) }, attempts, p.Stderr)
	if err != nil {
		return nil, err
	}

	result, err := setup.SetupVault(ctx, a, setup.Options{Address: address, Token: token, Name: deviceName, Password: password, Now: a.Now,
		ReadResumeSecretKey: func() (string, error) {
			if existing == nil || existing.VaultID == "" {
				return "", nil
			}

			if o.KitOut != "" {
				saved, err := files.OptionalRead(o.KitOut)
				if err != nil || saved == nil {
					return "", err
				}

				kit, err := recovery.ParseKit(*saved)

				return kit.SecretKey, err
			}

			has, err := p.Consent("Setup stopped after giving you a recovery kit. Do you still have it?", true)
			if err != nil || !has {
				return "", err
			}

			key, err := p.Secret("Secret key from that kit (EK1-…)", recovery.SecretKeyProblem)

			return textcase.Trim(key), err
		}, OnKit: func(kit vault.SetupKit) error {
			if o.KitOut != "" {
				if err := recovery.WriteKit(o.KitOut, kit); err != nil {
					return err
				}

				_, _ = fmt.Fprintf(stdout, "Recovery kit saved to %s\n", o.KitOut)

				return nil
			}

			if e.ReportKit != nil {
				return e.ReportKit(kit, deviceName)
			}

			return errors.New(errors.NotImplemented, "Recovery kit PDF writer is not configured")
		}})
	if err != nil {
		return nil, err
	}

	if err = SetupPreferences(ctx, a, o.Preferences, p, e.InstallAgent); err != nil {
		return nil, err
	}

	return result.State, store.SaveState(ctx, a.Home, result.State, a.Timing)
}
