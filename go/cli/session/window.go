package session

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

func RecordUnlockWindow(ctx context.Context, c *client.Client, state *model.State) error {
	response, err := c.Request(ctx, "/v1/unlock-window", "GET", nil)
	if errors.Is(err, errors.Locked) || errors.Is(err, errors.RestoredMode) {
		return nil
	}

	if err != nil {
		return err
	}

	defer func() { _ = response.Body.Close() }() // Best-effort cleanup must not replace the operation result.
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	window, err := serverprotocol.UnlockWindowSchema.Decode(raw)
	if err != nil {
		return err
	}

	state.Session = &model.Window{UnlockedUntil: sessionTime(window.UnlockedUntil), FreshUntil: float64(window.FreshUntil)}

	return nil
}

func sessionTime(value *int64) *float64 {
	if value == nil {
		return nil
	}
	n := float64(*value)
	return &n
}
