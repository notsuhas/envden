package context

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Context struct {
	Previous                   b.Signed[m.ManifestHeader]
	State                      *d.State
	Files                      m.Files
	RequestSigner              []byte
	MissingBlobs               map[string]bool
	DestinationPin             []byte
	AncestorHeaderHashes       map[string]bool
	RepairRegistrationRequired bool
}
