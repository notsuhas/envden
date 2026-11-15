package devices

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RenameCheck(devices []members.DeviceRecord, own []byte, name string) string {
	if !members.IsDeviceName(name) {
		return "invalid"
	}
	for _, d := range devices {
		if d.Name == name {
			if b.Equal(d.Id, own) {
				return "unchanged"
			}
			return "taken"
		}
	}
	return "rename"
}

func RenameDevice(ctx context.Context, a contracts.Adapters, name string, now func() int64, fetch client.Fetch) (string, error) {
	kind := ""
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		_, err := client.RetryHead(func() (bool, error) {
			cxt, e := shared.AdminContext(ctx, a, now, fetch)
			if e != nil {
				return false, e
			}
			h, e := shared.CurrentHistory(ctx, cxt)
			if e != nil {
				return false, e
			}
			ds := []members.DeviceRecord{}
			for _, id := range h.State.DeviceOrder {
				ds = append(ds, h.State.Devices[id])
			}
			check := RenameCheck(ds, cxt.Identity.Record.Id, name)
			if check == "unchanged" {
				kind = "unchanged"
				return true, nil
			}
			if check == "taken" {
				return false, errors.New(errors.InvalidInput, "Another device has that name")
			}
			if check == "invalid" {
				return false, errors.New(errors.InvalidInput, "Device names are 1-64 bytes with no invisible characters")
			}
			entry, e := shared.SignEntry(cxt, h, 7, p.RenameDevice{Device: cxt.Identity.Record.Id, Name: name})
			if e != nil {
				return false, e
			}
			swap, e := shared.AdminSwap(h, cxt.Identity, 13, now(), m.Swap{Entries: []b.Signed[c.Entry]{entry}})
			if e != nil {
				return false, e
			}
			e = shared.CommitAdmin(ctx, cxt, swap)
			kind = "renamed"
			return e == nil, e
		})
		return err
	})
	return kind, err
}
