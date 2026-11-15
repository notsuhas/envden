package repair

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/chain/devices"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func LocalRepairChain(encoded []string) ([]b.Signed[c.Entry], devices.Result, error) {
	entries := []b.Signed[c.Entry]{}
	for _, value := range encoded {
		raw, e := client.Binary(value)
		if e != nil {
			return nil, devices.Result{}, e
		}
		entry, e := b.Decode(b.SignedCodec(c.EntryCodec), raw)
		if e != nil {
			return nil, devices.Result{}, e
		}
		entries = append(entries, entry)
	}
	chain, err := devices.VerifyChain(entries)
	return entries, chain, err
}
