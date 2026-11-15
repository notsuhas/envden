package keys

import (
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	e "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func DeviceWrap(entries []b.Signed[p.Entry], recipient []byte, through *uint64) *d.Wrap {
	var wrap *d.Wrap
	for _, signed := range entries {
		entry := signed.Body
		if through != nil && entry.Seq > *through {
			break
		}
		if entry.Kind == 1 {
			add := entry.Payload.(e.AddDevice)
			if b.Equal(add.Device.Id, recipient) {
				wrap = &add.Wrap
			}
		}
		var change *d.EpochChange
		switch entry.Kind {
		case 2:
			v := entry.Payload.(e.RemoveDevice).Change
			change = &v
		case 3:
			v := entry.Payload.(e.NewEpoch).Change
			change = &v
		case 4:
			v := entry.Payload.(e.ReplaceRecovery).Change
			change = &v
		}
		if change != nil {
			wrap = nil
			for _, v := range change.Wraps {
				if b.Equal(v.Recipient, recipient) {
					wrap = &v
					break
				}
			}
		}
	}
	return wrap
}
