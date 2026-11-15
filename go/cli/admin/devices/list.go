package devices

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/cli/contracts"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Device struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	ClientVersion   *string `json:"clientVersion"`
	Unconfirmed     bool    `json:"unconfirmed"`
	RecoveryKeyHeld bool    `json:"recoveryKeyHeld"`
	Current         bool    `json:"current"`
}

func ListDevices(ctx context.Context, a contracts.Adapters, now func() int64, fetch client.Fetch) ([]Device, error) {
	c, err := shared.AdminContext(ctx, a, now, fetch)
	if err != nil {
		return nil, err
	}
	h, err := shared.CurrentHistory(ctx, c)
	if err != nil {
		return nil, err
	}
	holders := RecoveryHolders(h)
	seen, err := routes.Do(ctx, c.Client, routes.Devices, nil)
	if err != nil {
		return nil, err
	}
	result := []Device{}
	for _, key := range h.State.DeviceOrder {
		d := h.State.Devices[key]
		item := Device{ID: b.Base32(d.Id), Name: d.Name, Unconfirmed: true, RecoveryKeyHeld: holders[b.Base32(d.Id)], Current: b.Equal(d.Id, c.Identity.Record.Id)}
		for _, s := range seen.Devices {
			if s.Id == client.Text(d.Id) {
				item.ClientVersion = s.ClientVersion
				item.Unconfirmed = !s.Confirmed
				break
			}
		}
		result = append(result, item)
	}
	return result, nil
}
