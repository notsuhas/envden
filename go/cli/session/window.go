package session

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"io"
)

func RecordUnlockWindow(ctx context.Context, c *client.Client, state *model.State) error {
	response, err := c.Request(ctx, "/v1/unlock-window", "GET", nil)
	if errors.Is(err, errors.Locked) || errors.Is(err, errors.RestoredMode) {
		return nil
	}
	if err != nil {
		return err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	window, err := p.UnlockWindowSchema.Decode(raw)
	if err != nil {
		return err
	}
	state.Session = &model.Window{UnlockedUntil: window.UnlockedUntil, FreshUntil: window.FreshUntil}
	return nil
}
