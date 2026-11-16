package move

import (
	"context"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

type Options struct {
	Address, Token, Password string
	Resume, Abort            bool
	Now                      func() int64
	Fetcher                  client.Fetch
}

func MoveServer(ctx context.Context, a contracts.Adapters, o Options) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		cxt, err := shared.AdminContext(ctx, a, o.Now, o.Fetcher)
		if err != nil {
			return err
		}

		if _, err = session.Login(ctx, cxt.Client, cxt.VaultID, session.Password{Value: o.Password}, ""); err != nil {
			return err
		}

		directory := filepath.Join(a.Home, "state")
		saved, err := files.OptionalRead(filepath.Join(directory, "move-address"))
		if err != nil {
			return err
		}

		address := o.Address
		if address == "" && saved != nil {
			address = *saved
		}

		if o.Abort {
			return abortMove(ctx, cxt, directory, address, o.Fetcher)
		}

		if address == "" && o.Resume {
			address, err = resumeMoveAddress(ctx, cxt, directory)
			if err != nil {
				return err
			}
		}

		if address == "" {
			return errors.New(errors.InvalidInput, "Specify the destination server")
		}

		token, pin, _, err := moveCredentials(a, directory, o.Token)
		if err != nil {
			return err
		}

		if _, err = client.Hello(ctx, address, pin, o.Fetcher, version.MinServer); err != nil {
			return err
		}

		options := client.Options{Address: address, Pin: pin, VaultID: cxt.VaultID, Identity: cxt.Identity, Now: o.Now, Fetcher: o.Fetcher, Version: version.Version, HelloCache: a.HelloCache}
		if token != nil {
			key, e := proofs.TokenKey("setup", token.Secret)
			if e != nil {
				return e
			}

			options.Proof = func(request serverprotocol.Request) ([]byte, error) { return proofs.TokenProof("setup", key, request) }
		}

		destination := client.CreateClient(options)
		if err = files.AtomicWrite(filepath.Join(directory, "move-address"), []byte(address), a.Now); err != nil {
			return err
		}

		if err = files.AtomicWrite(filepath.Join(directory, "move-pin"), []byte(client.Text(pin)), a.Now); err != nil {
			return err
		}

		swap, err := preparedSwap(ctx, cxt, destination, directory, pin, address, o)
		if err != nil {
			return err
		}

		if err = requireDestination(swap, pin, address); err != nil {
			return err
		}

		raw, err := encoding.Encode(manifests.SwapCodec, swap)
		if err != nil {
			return err
		}

		if err = shared.Send(ctx, cxt.Client, "/v1/swap", "POST", raw); err != nil {
			return err
		}

		if err = shared.Send(ctx, destination, "/v1/swap", "POST", raw); err != nil {
			return err
		}

		if _, err = session.Login(ctx, destination, cxt.VaultID, session.Password{Value: o.Password}, ""); err != nil {
			return err
		}

		if err = SwitchServer(ctx, a, address, o.Now, o.Fetcher, nil); err != nil {
			return err
		}

		return clearMove(cxt, directory)
	})
}

func requireDestination(swap manifests.Swap, pin []byte, address string) error {
	if len(swap.Entries) > 0 {
		if moved, ok := swap.Entries[0].Body.Payload.(entrypayloads.ServerMoved); ok && encoding.Equal(moved.NewPin, pin) && moved.NewAddress == address {
			return nil
		}
	}

	return errors.New(errors.InvalidInput, "Resume destination differs from the stored move")
}

func preparedSwap(ctx context.Context, cxt *shared.Context, destination *client.Client, directory string, pin []byte, address string, o Options) (manifests.Swap, error) {
	raw, err := os.ReadFile(filepath.Join(directory, "move-swap.bin"))
	if err == nil {
		return encoding.Decode(manifests.SwapCodec, raw)
	}

	if !os.IsNotExist(err) {
		return manifests.Swap{}, err
	}

	if err = shared.Send(ctx, cxt.Client, "/v1/move/sk-pub", "GET", nil); err != nil {
		return manifests.Swap{}, err
	}

	if err = shared.Send(ctx, destination, "/v1/move/session", "POST", nil); err != nil {
		return manifests.Swap{}, err
	}

	if err = shared.Send(ctx, cxt.Client, "/v1/move/freeze", "POST", nil); err != nil {
		return manifests.Swap{}, err
	}

	h, err := shared.CurrentHistory(ctx, cxt)
	if err != nil {
		return manifests.Swap{}, err
	}

	if err = shared.CopyServer(ctx, cxt.Client, destination, h); err != nil {
		return manifests.Swap{}, err
	}

	if _, err = session.RegisterPassword(ctx, destination, cxt.VaultID, o.Password); err != nil {
		return manifests.Swap{}, err
	}

	entry, err := shared.SignEntry(cxt, h, 5, entrypayloads.ServerMoved{OldPin: h.State.ServerPin, NewPin: pin, NewAddress: address})
	if err != nil {
		return manifests.Swap{}, err
	}

	swap, err := shared.AdminSwap(h, cxt.Identity, 10, o.Now(), manifests.Swap{Entries: []encoding.Signed[codecs.Entry]{entry}})
	if err != nil {
		return swap, err
	}

	raw, err = encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return swap, err
	}

	return swap, files.AtomicWrite(filepath.Join(directory, "move-swap.bin"), raw, cxt.Now)
}
