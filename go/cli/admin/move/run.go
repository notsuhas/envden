package move

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"os"
	"path/filepath"
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
			options.Proof = func(request s.Request) ([]byte, error) { return proofs.TokenProof("setup", key, request) }
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
		raw, err := b.Encode(m.SwapCodec, swap)
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
		if err = SwitchServer(ctx, a, address, o.Now, o.Fetcher); err != nil {
			return err
		}
		return clearMove(cxt, directory)
	})
}

func requireDestination(swap m.Swap, pin []byte, address string) error {
	if len(swap.Entries) > 0 {
		if moved, ok := swap.Entries[0].Body.Payload.(p.ServerMoved); ok && b.Equal(moved.NewPin, pin) && moved.NewAddress == address {
			return nil
		}
	}
	return errors.New(errors.InvalidInput, "Resume destination differs from the stored move")
}

func preparedSwap(ctx context.Context, cxt *shared.Context, destination *client.Client, directory string, pin []byte, address string, o Options) (m.Swap, error) {
	raw, err := os.ReadFile(filepath.Join(directory, "move-swap.bin"))
	if err == nil {
		return b.Decode(m.SwapCodec, raw)
	}
	if !os.IsNotExist(err) {
		return m.Swap{}, err
	}
	if err = shared.Send(ctx, cxt.Client, "/v1/move/sk-pub", "GET", nil); err != nil {
		return m.Swap{}, err
	}
	if err = shared.Send(ctx, destination, "/v1/move/session", "POST", nil); err != nil {
		return m.Swap{}, err
	}
	if err = shared.Send(ctx, cxt.Client, "/v1/move/freeze", "POST", nil); err != nil {
		return m.Swap{}, err
	}
	h, err := shared.CurrentHistory(ctx, cxt)
	if err != nil {
		return m.Swap{}, err
	}
	if err = shared.CopyServer(ctx, cxt.Client, destination, h); err != nil {
		return m.Swap{}, err
	}
	if _, err = session.RegisterPassword(ctx, destination, cxt.VaultID, o.Password); err != nil {
		return m.Swap{}, err
	}
	entry, err := shared.SignEntry(cxt, h, 5, p.ServerMoved{OldPin: h.State.ServerPin, NewPin: pin, NewAddress: address})
	if err != nil {
		return m.Swap{}, err
	}
	swap, err := shared.AdminSwap(h, cxt.Identity, 10, o.Now(), m.Swap{Entries: []b.Signed[c.Entry]{entry}})
	if err != nil {
		return swap, err
	}
	raw, err = b.Encode(m.SwapCodec, swap)
	if err != nil {
		return swap, err
	}
	return swap, files.AtomicWrite(filepath.Join(directory, "move-swap.bin"), raw, cxt.Now)
}
