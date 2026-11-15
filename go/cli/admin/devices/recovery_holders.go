package devices

import (
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RecoveryHolders(h shared.History) map[string]bool {
	holders := map[string]bool{}
	for i, header := range h.Headers {
		if i == 0 || !encoding.Equal(h.Headers[i-1].Body.EnvelopeHash, header.Body.EnvelopeHash) {
			holders[encoding.Base32(header.Body.Signer)] = true
		}
	}

	for _, signed := range h.Entries {
		added, ok := signed.Body.Payload.(entrypayloads.AddDevice)
		if !ok {
			continue
		}

		known := false
		for _, other := range h.Entries {
			switch payload := other.Body.Payload.(type) {
			case entrypayloads.Genesis:
				known = known || encoding.Equal(payload.Device.Id, signed.Body.Signer)
			case entrypayloads.AddDevice:
				known = known || encoding.Equal(payload.Device.Id, signed.Body.Signer)
			}
		}

		if !known {
			holders[encoding.Base32(added.Device.Id)] = true
		}
	}

	return holders
}
