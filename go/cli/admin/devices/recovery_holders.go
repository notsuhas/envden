package devices

import (
	"github.com/notsuhas/envden/go/cli/admin/shared"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RecoveryHolders(h shared.History) map[string]bool {
	holders := map[string]bool{}
	for i, header := range h.Headers {
		if i == 0 || !b.Equal(h.Headers[i-1].Body.EnvelopeHash, header.Body.EnvelopeHash) {
			holders[b.Base32(header.Body.Signer)] = true
		}
	}
	for _, signed := range h.Entries {
		added, ok := signed.Body.Payload.(p.AddDevice)
		if !ok {
			continue
		}
		known := false
		for _, other := range h.Entries {
			switch payload := other.Body.Payload.(type) {
			case p.Genesis:
				known = known || b.Equal(payload.Device.Id, signed.Body.Signer)
			case p.AddDevice:
				known = known || b.Equal(payload.Device.Id, signed.Body.Signer)
			}
		}
		if !known {
			holders[b.Base32(added.Device.Id)] = true
		}
	}
	return holders
}
