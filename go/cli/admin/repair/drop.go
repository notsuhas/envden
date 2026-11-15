package repair

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func DropDevices(ctx context.Context, c *shared.Context, h shared.History, without []string) (shared.History, error) {
	for _, name := range without {
		d := devices.FindDevice(h, name)
		if d == nil {
			continue
		}
		if b.Equal(d.Id, c.Identity.Record.Id) || len(h.State.Devices) == 1 {
			return h, errors.New(errors.InvalidInput, "Cannot drop this device or the last device")
		}
		swap, err := devices.RevocationSwap(ctx, c, h, d.Id, c.Now())
		if err != nil {
			return h, err
		}
		h, err = shared.SubmitAdmin(ctx, c, swap)
		if err != nil {
			return h, err
		}
	}
	return h, nil
}
