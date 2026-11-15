package swaps

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/chain/swaps/operation"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
)

type Authorization = operation.Authorization

func OperationRequirement(previous, header manifests.ManifestHeader, entries []codecs.Signed[codecs.Entry], before *devicechain.State, onNewServer ...bool) (Authorization, error) {
	return operation.OperationRequirement(previous, header, entries, before, onNewServer...)
}
