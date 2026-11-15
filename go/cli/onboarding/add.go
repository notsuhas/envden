package onboarding

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/pairing"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"io"
)

func RunDeviceAdd(ctx context.Context, a contracts.Adapters, p Prompts, stdout io.Writer, pause func(context.Context) error) error {
	local, err := store.LoadState(a.Home)
	if err != nil {
		return err
	}
	local, err = state.RequireConfigured(local)
	if err != nil {
		return err
	}
	connection, err := vault.VaultConnection(ctx, a, local, nil)
	if err != nil {
		return err
	}
	password, err := p.Secret("Master password", nil)
	if err != nil {
		return err
	}
	window, err := session.Login(ctx, connection.Client, connection.VaultID, session.Password{Value: password}, "")
	if err != nil {
		return err
	}
	if window != nil {
		if err = lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
			latest, err := store.LoadState(a.Home)
			if err != nil {
				return err
			}
			latest, err = state.RequireConfigured(latest)
			if err != nil {
				return err
			}
			latest.Session = window
			latest.Touch("session")
			return store.SaveState(ctx, a.Home, latest, a.Timing)
		}); err != nil {
			return err
		}
	}
	resumed, err := persistence.ResumeApproval(ctx, a, connection.Client, connection.VaultID)
	if err != nil {
		return err
	}
	if resumed {
		fmt.Fprintln(stdout, "Device added")
		return nil
	}
	pin, err := client.Binary(local.Server.Pin)
	if err != nil {
		return err
	}
	attempt, err := pairing.OpenPairing(ctx, connection.Client, pin)
	if err != nil {
		return err
	}
	fmt.Fprintf(stdout, "%s\n", output.SanitizeConsole("On the new device run: envden join "+local.Server.Address+"\nand enter code "+attempt.Code+" (valid 10 minutes). Keep this running."))
	name := ""
	kind, err := pairing.ApprovePairing(ctx, a, connection.Client, connection.Identity, pin, connection.VaultID, attempt, a.Now, func(slot string) error {
		_, err := pairing.WaitMessage(ctx, connection.Client, fmt.Sprintf("/v1/pairing/mailboxes/%d/%s", attempt.Number, slot), a.Now, attempt.ExpiresAt, pause)
		return err
	}, func(proposed string) (bool, error) { name = proposed; return p.Consent("Add "+proposed+"?", false) })
	if err != nil {
		return err
	}
	message := "Device added"
	if kind == "declined" {
		message = "Declined"
	} else if name != "" {
		message = "Device " + name + " added"
	}
	fmt.Fprintln(stdout, output.SanitizeConsole(message))
	return nil
}
