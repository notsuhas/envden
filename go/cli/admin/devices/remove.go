package devices

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RemoveOptions struct {
	Password  func() (string, error)
	NewKit    bool
	Recommend func() (bool, error)
	Confirm   func(Exposure) (bool, error)
	OnKit     func(recovery.ReplacementKit) error
	Now       func() int64
	Fetcher   client.Fetch
}

type RemoveResult struct {
	Kind            string
	RecommendNewKit bool
	Exposure        Exposure
}

func RemoveDevice(ctx context.Context, a contracts.Adapters, name string, o RemoveOptions) (RemoveResult, error) {
	var result RemoveResult
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		var err error
		result, err = client.RetryHead(func() (RemoveResult, error) {
			c, e := shared.AdminContext(ctx, a, o.Now, o.Fetcher)
			if e != nil {
				return RemoveResult{}, e
			}

			settled, e := recovery.SettlePendingKit(ctx, c)
			if e != nil {
				return RemoveResult{}, e
			}

			h, e := shared.CurrentHistory(ctx, c)
			if e != nil {
				return RemoveResult{}, e
			}

			device := FindDevice(h, name)
			if settled && device == nil {
				return RemoveResult{Kind: "finished"}, nil
			}

			if device == nil {
				return RemoveResult{}, errors.New(errors.NotFound, "Device not found")
			}

			if encoding.Equal(device.Id, c.Identity.Record.Id) || len(h.State.Devices) == 1 {
				return RemoveResult{}, errors.New(errors.InvalidInput, "Cannot remove this device or the last device")
			}

			password, e := o.Password()
			if e != nil {
				return RemoveResult{}, e
			}

			if _, e = session.Login(ctx, c.Client, c.VaultID, session.Password{Value: password}, ""); e != nil {
				return RemoveResult{}, e
			}

			exposure, e := ExposedNames(ctx, c, h)
			if e != nil {
				return RemoveResult{}, e
			}

			if o.Confirm != nil {
				yes, e := o.Confirm(exposure)
				if e != nil {
					return RemoveResult{}, e
				}

				if !yes {
					return RemoveResult{}, errors.New(errors.InvalidInput, "Device removal cancelled")
				}
			}

			recommend := RecoveryHolders(h)[encoding.Base32(device.Id)]
			replace := o.NewKit
			if !replace && recommend && o.Recommend != nil {
				replace, e = o.Recommend()
				if e != nil {
					return RemoveResult{}, e
				}
			}

			if replace {
				if o.OnKit == nil {
					return RemoveResult{}, errors.New(errors.Internal, "Missing recovery kit output")
				}

				_, e = recovery.ReplaceKit(ctx, a, password, o.Now, o.OnKit, o.Fetcher, device.Id)
			} else {
				swap, err := RevocationSwap(ctx, c, h, device.Id, o.Now())
				e = err
				if e == nil {
					e = shared.CommitAdmin(ctx, c, swap)
				}
			}

			return RemoveResult{Kind: "removed", RecommendNewKit: recommend, Exposure: exposure}, e
		})

		return err
	})

	return result, err
}

func FindDevice(h shared.History, name string) *members.DeviceRecord {
	for _, id := range h.State.DeviceOrder {
		d := h.State.Devices[id]
		if d.Name == name || encoding.Base32(d.Id) == name {
			return &d
		}
	}

	return nil
}
