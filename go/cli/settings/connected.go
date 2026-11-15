package settings

import (
	"context"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

func SetCheckoutPlacement(ctx context.Context, a contracts.Adapters, path, mode string) (Config, error) {
	if mode != "link" && mode != "copy" {
		return Config{}, errors.New(errors.InvalidInput, "Expected placement <checkout> link|copy")
	}

	checkout, err := a.Repo.CheckoutAt(path)
	if err != nil {
		return Config{}, err
	}

	if checkout == nil {
		return Config{}, errors.New(errors.NotFound, "Checkout not found")
	}

	var result Config
	err = lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		config, e := ReadConfig(a.Home)
		if e != nil {
			return e
		}

		placement := jsonvalue.Object{}
		if config.Placement != nil {
			placement = *config.Placement
		}

		placement.Set(checkout.Root, mode)
		raw, e := jsonvalue.Marshal(placement)
		if e != nil {
			return e
		}

		result, e = SetConfig(ctx, "placement", string(raw), a.Home, a.Timing, false)

		return e
	})

	return result, err
}

func SetUnlockPeriod(ctx context.Context, c *client.Client, vaultID []byte, value, password string) error {
	period, err := UnlockPeriod(value)
	if err != nil {
		return err
	}

	if _, err = session.Login(ctx, c, vaultID, session.Password{Value: password}, ""); err != nil {
		return err
	}

	response, err := c.Request(ctx, "/v1/settings/unlock-period", "PUT", serverprotocol.UnlockPeriod{Period: period})
	if err == nil {
		_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	}

	return err
}

func GetUnlockPeriod(ctx context.Context, c *client.Client) (serverprotocol.UnlockPeriod, error) {
	return routes.Do(ctx, c, routes.UnlockPeriod, nil)
}
