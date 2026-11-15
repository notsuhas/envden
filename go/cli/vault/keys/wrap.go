package keys

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func DeviceWrap(entries []encoding.Signed[codecs.Entry], recipient []byte, through *uint64) *epochs.Wrap {
	var wrap *epochs.Wrap
	for _, signed := range entries {
		entry := signed.Body
		if through != nil && entry.Seq > *through {
			break
		}

		if entry.Kind == 1 {
			add := entry.Payload.(entrypayloads.AddDevice)
			if encoding.Equal(add.Device.Id, recipient) {
				wrap = &add.Wrap
			}
		}

		var change *epochs.EpochChange
		switch entry.Kind {
		case 2:
			v := entry.Payload.(entrypayloads.RemoveDevice).Change
			change = &v
		case 3:
			v := entry.Payload.(entrypayloads.NewEpoch).Change
			change = &v
		case 4:
			v := entry.Payload.(entrypayloads.ReplaceRecovery).Change
			change = &v
		}

		if change != nil {
			wrap = nil
			for _, v := range change.Wraps {
				if encoding.Equal(v.Recipient, recipient) {
					wrap = &v
					break
				}
			}
		}
	}

	return wrap
}
