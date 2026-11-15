package manifests

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Source interface {
	Header([]byte) (*b.Signed[m.ManifestHeader], error)
	Entry([]byte) (*b.Signed[c.Entry], error)
	Files([]byte) (*m.Files, error)
	Keyring([]byte) ([]byte, error)
	EpochKey(int) ([]byte, error)
}

type Checkpoint struct {
	Header b.Signed[m.ManifestHeader]
	Files  m.Files
	State  *d.State
	IdKey  []byte
}

type SourceFailure struct{ Failure *e.Error }

func (f *SourceFailure) Error() string { return f.Failure.Error() }

func (f *SourceFailure) Unwrap() error { return f.Failure }

type protectedSource struct{ Source }

func sourceResult[T any](v T, err error) (T, error) {
	if err != nil {
		return v, &SourceFailure{Failure: e.Wrap(e.Internal, "Chain source failed", err)}
	}

	return v, nil
}

func (s protectedSource) Header(h []byte) (*b.Signed[m.ManifestHeader], error) {

	return sourceResult(s.Source.Header(h))
}

func (s protectedSource) Entry(h []byte) (*b.Signed[c.Entry], error) {

	return sourceResult(s.Source.Entry(h))
}

func (s protectedSource) Files(h []byte) (*m.Files, error) { return sourceResult(s.Source.Files(h)) }

func (s protectedSource) Keyring(h []byte) ([]byte, error) { return sourceResult(s.Source.Keyring(h)) }

func (s protectedSource) EpochKey(n int) ([]byte, error) { return sourceResult(s.Source.EpochKey(n)) }

func ProtectSource(source Source) Source { return protectedSource{source} }

func IndexHeaders(headers []b.Signed[m.ManifestHeader]) map[uint64]b.Signed[m.ManifestHeader] {
	out := map[uint64]b.Signed[m.ManifestHeader]{}
	for _, h := range headers {
		if _, ok := out[h.Body.Seq]; !ok {
			out[h.Body.Seq] = h
		}
	}

	return out
}
