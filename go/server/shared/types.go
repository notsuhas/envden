package shared

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"regexp"

	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

type Keys struct {
	SecretKey, PublicKey []byte
	OpaqueSetup          string
}
type Config struct{ AppVersion, MinClient string }
type Options struct {
	ChainCache  map[string]any
	ReserveBody func(int64, string, []byte, []byte) func()
	Storage     a.Storage
	Now         func() int64
	ServerKeys  Keys
	Config      Config
	Stderr      io.Writer
	// Await runs fn with the request lock released, like a Bun await on body I/O.
	Await func(fn func())
}
type Auth struct {
	Request     s.Request
	Member      bool
	Proof       []byte
	RateReceipt string
}

func Must[T any](v T, err error) T { Check(err); return v }
func Check(err error) {
	if err != nil {
		panic(err)
	}
}
func Fail(code e.Code, message string) { panic(e.New(code, message)) }
func Text(v []byte) string             { return base64.RawURLEncoding.EncodeToString(v) }

var encoded = regexp.MustCompile("^[A-Za-z0-9_-]+$")

func Binary(value string, length ...int) []byte {
	if !encoded.MatchString(value) {
		Fail(e.InvalidInput, "Invalid encoding")
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || Text(data) != value || len(length) > 0 && len(data) != length[0] {
		Fail(e.InvalidInput, "Invalid encoding")
	}
	return data
}
func JSON(value any) []byte {
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	Check(enc.Encode(value))
	return bytes.TrimSuffix(out.Bytes(), []byte("\n"))
}
func Input[T any](fn func() T) (out T) {
	defer func() {
		if cause := recover(); cause != nil {
			if err, ok := cause.(*e.Error); ok && err.Code == e.UpdateRequired {
				Fail(e.ServerTooOld, "Update the server")
			}
			Fail(e.InvalidInput, "Invalid input")
		}
	}()
	return fn()
}
func Parse[T any](schema s.Schema[T], body []byte) T {
	return Input(func() T { return Must(schema.Decode(body)) })
}
func Transaction[T any](storage a.Storage, fn func() T) (out T) {
	Check(storage.Transaction(func() (err error) {
		defer func() {
			if x := recover(); x != nil {
				if v, ok := x.(error); ok {
					err = v
				} else {
					panic(x)
				}
			}
		}()
		out = fn()
		return nil
	}))
	return
}
