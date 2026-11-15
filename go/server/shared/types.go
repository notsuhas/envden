package shared

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"regexp"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	protocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

type Keys struct {
	SecretKey, PublicKey []byte
	OpaqueSetup          string
}

type Config struct{ AppVersion, MinClient string }

type Options struct {
	ChainCache  map[string]any
	ReserveBody func(int64, string, []byte, []byte) (func(), error)
	Storage     adapters.Storage
	Now         func() int64
	ServerKeys  Keys
	Config      Config
	Stderr      io.Writer

	// Await releases the request lock during body I/O, as Bun does at an await.
	Await func(fn func())
}

type Auth struct {
	Request     protocol.Request
	Member      bool
	Proof       []byte
	RateReceipt string
}

func Text(value []byte) string { return base64.RawURLEncoding.EncodeToString(value) }

var encoded = regexp.MustCompile("^[A-Za-z0-9_-]+$")

func Binary(value string, length ...int) ([]byte, error) {
	if !encoded.MatchString(value) {
		return nil, errors.New(errors.InvalidInput, "Invalid encoding")
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || Text(data) != value || len(length) > 0 && len(data) != length[0] {
		return nil, errors.New(errors.InvalidInput, "Invalid encoding")
	}

	return data, nil
}

func JSON(value any) ([]byte, error) {
	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}

	return bytes.TrimSuffix(out.Bytes(), []byte("\n")), nil
}

func Input[T any](fn func() (T, error)) (T, error) {
	value, err := fn()
	if err != nil {
		if errors.Is(err, errors.UpdateRequired) {
			return *new(T), errors.New(errors.ServerTooOld, "Update the server")
		}

		return *new(T), errors.New(errors.InvalidInput, "Invalid input")
	}

	return value, nil
}

func Parse[T any](schema protocol.Schema[T], body []byte) (T, error) {
	return Input(func() (T, error) { return schema.Decode(body) })
}

func Transaction[T any](storage adapters.Storage, fn func() (T, error)) (T, error) {
	var out T
	err := storage.Transaction(func() error {
		var err error
		out, err = fn()

		return err
	})

	return out, err
}
