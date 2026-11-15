package move

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"os"
	"path/filepath"
)

func abortMove(ctx context.Context, c *shared.Context, directory, address string, fetch client.Fetch) error {
	h, err := shared.CurrentHistory(ctx, c)
	if err != nil {
		return err
	}
	pin, err := client.Binary(c.Local.Server.Pin)
	if err != nil {
		return err
	}
	if !b.Equal(h.State.ServerPin, pin) {
		return errors.New(errors.Moving, "Move already committed; resume it instead")
	}
	if address != "" {
		saved, err := files.OptionalRead(filepath.Join(directory, "move-pin"))
		if err != nil {
			return err
		}
		if saved == nil {
			return errors.New(errors.InvalidData, "Missing move pin")
		}
		pin, err = client.Binary(*saved)
		if err != nil {
			return err
		}
		cl := client.CreateClient(client.Options{Address: address, Pin: pin, VaultID: c.VaultID, Identity: c.Identity, Now: c.Now, Fetcher: fetch, Version: version.Version, HelloCache: c.Adapters.HelloCache})
		if err = shared.Send(ctx, cl, "/v1/move/discard", "POST", nil); err != nil && !errors.Is(err, errors.NotFound) {
			return err
		}
	}
	if err = shared.Send(ctx, c.Client, "/v1/move/unfreeze", "POST", nil); err != nil {
		return err
	}
	return clearMove(c, directory)
}

func clearMove(c *shared.Context, directory string) error {
	for _, name := range []string{"move-address", "move-swap.bin", "move-pin"} {
		if err := os.Remove(filepath.Join(directory, name)); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return c.Adapters.Keychain.Delete("envden/" + c.Adapters.Home + "/move-token")
}
