package enginetest

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/pairing"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/vault/initial"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func pairedFixture(t *testing.T, beforeResume func(*fixture)) *fixture {
	f, _ := pairWith(t, beforeResume, nil)

	return f
}

func pairWith(t *testing.T, beforeResume func(*fixture), onConfirm func(*fixture)) (*fixture, pairing.Approval) {
	f := createConfiguredFixture(t, fixtureOptions{devices: 1, bare: true, password: "old password"})
	f.write(filepath.Join(f.checkout.Root, ".env"), original)
	f.track(&f.first, f.checkout, false, ".env")
	s := f.state(f.first)
	must(t, initial.PushInitialFiles(f.ctx, f.first, s, nil, nil))
	must(t, os.Remove(filepath.Join(f.first.Home, "state", "applied-files.json")))
	must(t, initial.PushInitialFiles(f.ctx, f.first, s, nil, nil))
	applied, err := local.AppliedFiles(f.first.Home)
	must(t, err)
	equal(t, len(applied), 1)
	id, err := identity.DeviceIdentity(f.ctx, f.first.Keychain, f.first.Home, "first", false, f.first.Timing)
	must(t, err)
	pin, err := client.Binary(s.Server.Pin)
	must(t, err)
	vault, err := encoding.Unbase32(f.kit.VaultID)
	must(t, err)
	cl := client.CreateClient(client.Options{Address: f.kit.Server, VaultID: vault, Pin: pin, Identity: id, Now: clock, Version: "0.0.0"})
	_, err = session.Login(f.ctx, cl, vault, session.Password{Value: "old password"}, "")
	must(t, err)
	attempt, err := pairing.OpenPairing(f.ctx, cl, pin)
	must(t, err)
	other, err := identity.DeviceIdentity(f.ctx, f.second.Keychain, f.second.Home, "second", false, f.second.Timing)
	must(t, err)
	joiner := client.CreateClient(client.Options{Address: f.kit.Server, VaultID: make([]byte, 32), Pin: pin, Identity: other, Now: clock, Version: "0.0.0"})
	ke1, ke2, ke3 := make(chan struct{}), make(chan struct{}), make(chan struct{})
	approved := make(chan error, 1)
	var approval pairing.Approval
	go func() {
		result, e := pairing.ApprovePairing(f.ctx, f.first, cl, id, pin, vault, attempt, clock, func(slot string) error {
			if _, err := os.Lstat(filepath.Join(f.first.Home, "state", "write.lock")); !os.IsNotExist(err) {
				return fmt.Errorf("approval wait holds state lock: %w", err)
			}

			if slot == "KE1" {
				<-ke1
			} else {
				if slot == "KE3" {
					close(ke2)
				}

				<-ke3
			}

			return nil
		}, func(string) (bool, error) {
			if onConfirm != nil {
				onConfirm(f)
			}

			return true, nil
		})

		if e == nil && result.Kind != "paired" {
			e = fmt.Errorf("unexpected pairing result %s", result.Kind)
		}

		approval = result

		approved <- e
	}()
	err = pairing.ExchangeJoiner(f.ctx, f.second, joiner, other, pin, attempt.Code, func(int64) error {
		if _, err := os.Lstat(filepath.Join(f.second.Home, "state", "write.lock")); !os.IsNotExist(err) {
			return fmt.Errorf("joiner wait holds state lock: %w", err)
		}

		close(ke1)
		<-ke2

		return nil
	})
	close(ke3)
	must(t, err)
	must(t, <-approved)
	listed, err := devices.ListDevices(f.ctx, f.first, clock, nil)
	must(t, err)
	assertPairingDevice(t, listed, encoding.Base32(other.Record.Id), true)

	if beforeResume != nil {
		beforeResume(f)
	}

	joined, err := pairing.ResumeJoiner(f.ctx, f.second, joiner, other, f.kit.Server, pin)
	must(t, err)
	equal(t, joined.VaultID, f.kit.VaultID)
	listed, err = devices.ListDevices(f.ctx, f.first, clock, nil)
	must(t, err)
	assertPairingDevice(t, listed, encoding.Base32(other.Record.Id), false)
	f.repo(&f.second, nil)

	return f, approval
}
