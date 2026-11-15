package swaps

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	o "github.com/notsuhas/envden/go/core/chain/swaps/operation"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
)

type Authorization = o.Authorization

func OperationRequirement(previous, header m.ManifestHeader, entries []c.Signed[c.Entry], before *d.State, onNewServer ...bool) (Authorization, error) {

	return o.OperationRequirement(previous, header, entries, before, onNewServer...)
}
