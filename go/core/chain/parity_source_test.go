package chain_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type sourceCall struct {
	Method string
	Args   json.RawMessage
	Value  json.RawMessage
	Error  *failure
}

type failure struct {
	Error string
	Code  enverrors.Code
}

func (f failure) value() error {
	if f.Code != "" {
		return enverrors.New(f.Code, f.Error)
	}

	return errors.New(f.Error)
}

type source struct{ Calls []sourceCall }

func fetch[T any](s source, method string, arg any) (T, error) {
	key, _ := json.Marshal([]any{arg})
	for _, call := range s.Calls {
		if call.Method == method && bytes.Equal(call.Args, key) {
			if call.Error != nil {
				var zero T

				return zero, call.Error.value()
			}

			return decode[T](call.Value), nil
		}
	}
	var zero T

	return zero, fmt.Errorf("unexpected source call: %s", method)
}

func (s source) Header(h []byte) (*encoding.Signed[manifests.ManifestHeader], error) {
	return fetch[*encoding.Signed[manifests.ManifestHeader]](s, "header", h)
}

func (s source) Entry(h []byte) (*encoding.Signed[codecs.Entry], error) {
	return fetch[*encoding.Signed[codecs.Entry]](s, "entry", h)
}

func (s source) Files(h []byte) (*manifests.Files, error) {
	return fetch[*manifests.Files](s, "files", h)
}

func (s source) Keyring(h []byte) ([]byte, error) { return fetch[[]byte](s, "keyring", h) }

func (s source) EpochKey(n int) ([]byte, error) { return fetch[[]byte](s, "epochKey", n) }
