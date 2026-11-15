package devicesandvault

import (
	"fmt"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	admin "github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/program/access"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/recovery"
	"github.com/notsuhas/envden/go/lib/commander"
)

func unlockAction(inv *commander.Invocation) error {
	a, p, stdout, err := access.Runtime(inv)
	if err != nil {
		return err
	}

	err = session.UnlockDevice(runtime.Context(inv), a, session.Password{Prompt: func(retry bool) (string, error) {
		label := "Master password"
		if retry {
			label = "Wrong master password. Try again"
		}

		return p.Secret(label, nil)
	}}, a.Fetcher)
	if err == nil {
		_, _ = fmt.Fprintln(stdout, "Unlocked")
	}

	return err
}

func deviceAddAction(inv *commander.Invocation) error {
	a, p, stdout, err := access.Runtime(inv)
	if err != nil {
		return err
	}

	return onboarding.RunDeviceAdd(runtime.Context(inv), a, p, stdout, access.Pause)
}

func vaultAction(action string) func(*commander.Invocation) error {
	return func(inv *commander.Invocation) error {
		a, p, stdout, err := access.Runtime(inv)
		if err != nil {
			return err
		}

		ctx := runtime.Context(inv)
		prompt := func(label string) (string, error) { return p.Secret(label, nil) }
		confirm := func() (string, error) {
			attempts := 1
			if p.Interactive {
				attempts = 3
			}

			return onboarding.ConfirmedPassword(prompt, attempts, p.Stderr)
		}
		if action == "replace" {
			password, err := prompt("Master password")
			if err != nil {
				return err
			}

			shown := false
			result, err := admin.ReplaceKit(ctx, a, password, a.Now, func(kit admin.ReplacementKit) error {
				path := access.String(inv.Values, "kitOut")
				if path != "" {
					if err := recovery.WriteKit(path, kit); err == nil {
						_, _ = fmt.Fprintf(stdout, "Recovery kit saved to %s\n", path)
					} else {
						_, _ = fmt.Fprintln(p.Stderr, "envden: Could not save the recovery kit; save the kit printed below")
						printKit(stdout, kit)
					}
				} else {
					name := a.Hostname
					local, err := store.LoadState(a.Home)
					if err != nil {
						return err
					}

					if local != nil {
						name = local.DeviceName
					}

					if err = access.ReportKit(a, p, stdout, vault.SetupKit{SecretKey: kit.SecretKey, VaultID: kit.VaultID, Server: kit.Server}, name); err != nil {
						return err
					}
				}

				shown = true

				return nil
			}, a.Fetcher, nil)
			if err != nil {
				if shown {
					_, _ = fmt.Fprintln(p.Stderr, "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.")
				}

				return err
			}

			if result.Kind == "finished" {
				_, _ = fmt.Fprintln(stdout, "Finished an interrupted kit replacement; the kit it showed is now active. Run again for another kit.")
			} else {
				_, _ = fmt.Fprintln(stdout, "Recovery kit replaced; the old kit no longer works")
			}

			return nil
		}

		switch action {
		case "rotate":
			password, err := prompt("Master password")
			if err != nil {
				return err
			}
			if err = devices.RotateVault(ctx, a, password, a.Now, a.Fetcher); err != nil {
				return err
			}
			_, _ = fmt.Fprintln(stdout, "Vault re-keyed; removed devices can't read new changes")
		case "change":
			old, err := prompt("Old master password")
			if err != nil {
				return err
			}
			password, err := confirm()
			if err != nil {
				return err
			}
			kit, err := prompt("Recovery secret key")
			if err != nil {
				return err
			}
			if err = admin.ChangePassword(ctx, a, old, password, kit, a.Now, a.Fetcher); err != nil {
				return err
			}
			_, _ = fmt.Fprintln(stdout, "Password changed; the kit stays valid")
		case "reset":
			password, err := confirm()
			if err != nil {
				return err
			}
			kit, err := prompt("Recovery secret key")
			if err != nil {
				return err
			}
			if err = admin.ResetPassword(ctx, a, password, kit, a.Now, a.Fetcher); err != nil {
				return err
			}
			_, _ = fmt.Fprintln(stdout, "Password reset; the kit stays valid")
		}

		return nil
	}
}
