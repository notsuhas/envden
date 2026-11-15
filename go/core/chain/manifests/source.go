package manifests

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Source interface {
	Header([]byte) (*encoding.Signed[manifests.ManifestHeader], error)
	Entry([]byte) (*encoding.Signed[codecs.Entry], error)
	Files([]byte) (*manifests.Files, error)
	Keyring([]byte) ([]byte, error)
	EpochKey(int) ([]byte, error)
}

type Checkpoint struct {
	Header encoding.Signed[manifests.ManifestHeader]
	Files  manifests.Files
	State  *devicechain.State
	IdKey  []byte
}

type SourceFailure struct{ Failure *enverrors.Error }

func (f *SourceFailure) Error() string { return f.Failure.Error() }

func (f *SourceFailure) Unwrap() error { return f.Failure }

type protectedSource struct{ Source }

func sourceResult[T any](v T, err error) (T, error) {
	if err != nil {
		return v, &SourceFailure{Failure: enverrors.Wrap(enverrors.Internal, "Chain source failed", err)}
	}

	return v, nil
}

func (s protectedSource) Header(h []byte) (*encoding.Signed[manifests.ManifestHeader], error) {
	return sourceResult(s.Source.Header(h))
}

func (s protectedSource) Entry(h []byte) (*encoding.Signed[codecs.Entry], error) {
	return sourceResult(s.Source.Entry(h))
}

func (s protectedSource) Files(h []byte) (*manifests.Files, error) {
	return sourceResult(s.Source.Files(h))
}

func (s protectedSource) Keyring(h []byte) ([]byte, error) { return sourceResult(s.Source.Keyring(h)) }

func (s protectedSource) EpochKey(n int) ([]byte, error) { return sourceResult(s.Source.EpochKey(n)) }

func ProtectSource(source Source) Source { return protectedSource{source} }

func IndexHeaders(headers []encoding.Signed[manifests.ManifestHeader]) map[uint64]encoding.Signed[manifests.ManifestHeader] {
	out := map[uint64]encoding.Signed[manifests.ManifestHeader]{}
	for _, h := range headers {
		if _, ok := out[h.Body.Seq]; !ok {
			out[h.Body.Seq] = h
		}
	}

	return out
}
