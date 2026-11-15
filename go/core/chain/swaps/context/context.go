package context

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Context struct {
	Previous                   encoding.Signed[manifests.ManifestHeader]
	State                      *devicechain.State
	Files                      manifests.Files
	RequestSigner              []byte
	MissingBlobs               map[string]bool
	DestinationPin             []byte
	AncestorHeaderHashes       map[string]bool
	RepairRegistrationRequired bool
}
