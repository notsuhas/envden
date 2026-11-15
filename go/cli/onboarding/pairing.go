package onboarding

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strconv"

	"github.com/notsuhas/envden/go/cli/admin/rejoin/classify"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/pairing"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	protocolpairing "github.com/notsuhas/envden/go/core/protocol/pairing"
)

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
			_, err := protocolpairing.NormalizePairingCode(v)
			if err != nil {
				return err.Error()
			}

			return ""
		})
		if err != nil {
			return err
		}

		normalized, err := protocolpairing.NormalizePairingCode(code)
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

		_, _ = fmt.Fprintln(stdout, "Waiting for the approving device")
	}

	_, err = pairing.FinishPairing(ctx, a, cl, ident, address, server.Pin, a.Now, pause, o.Rejoin)

	return err
}
