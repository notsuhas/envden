package repair

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func LocalRepairChain(encoded []string) ([]encoding.Signed[codecs.Entry], devices.Result, error) {
	entries := []encoding.Signed[codecs.Entry]{}
	for _, value := range encoded {
		raw, e := client.Binary(value)
		if e != nil {
			return nil, devices.Result{}, e
		}

		entry, e := encoding.Decode(encoding.SignedCodec(codecs.EntryCodec), raw)
		if e != nil {
			return nil, devices.Result{}, e
		}

		entries = append(entries, entry)
	}

	chain, err := devices.VerifyChain(entries)

	return entries, chain, err
}
