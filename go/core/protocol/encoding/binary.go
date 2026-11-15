package encoding

import (
	"bytes"
	"crypto/subtle"
	"encoding/binary"

	e "github.com/notsuhas/envden/go/core/errors"
)

var Empty = []byte{}

func Concat(parts ...[]byte) []byte { return bytes.Join(parts, nil) }

func Equal(a, b []byte) bool { return subtle.ConstantTimeCompare(a, b) == 1 }

func Compare(a, b []byte) int { return bytes.Compare(a, b) }

func RequireValue(ok bool, message ...string) {
	if !ok {
		m := "Invalid protocol data"
		if len(message) > 0 {
			m = message[0]
		}
		panic(e.New(e.InvalidData, m))
	}
}

func Try[T any](fn func() T) (v T, err error) {
	defer func() {
		if p := recover(); p != nil {
			if x, ok := p.(*e.Error); ok {
				err = x
			} else {
				panic(p)
			}
		}
	}()

	return fn(), nil
}

func Must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

type Reader struct {
	Data   []byte
	Offset int
}

func (r *Reader) Take(n int) []byte {
	RequireValue(n >= 0 && n <= len(r.Data)-r.Offset, "Truncated data")
	v := bytes.Clone(r.Data[r.Offset : r.Offset+n])
	r.Offset += n

	return v
}

func (r *Reader) End() { RequireValue(r.Offset == len(r.Data), "Trailing bytes") }

type Codec[T any] struct {
	Read  func(*Reader) T
	Write func(T) []byte
}

func Fixed(n int) Codec[[]byte] {
	return Codec[[]byte]{func(r *Reader) []byte { return r.Take(n) }, func(v []byte) []byte {
		RequireValue(len(v) == n, "Wrong byte length")

		return v
	}}
}

var B16 = Fixed(16)
var B32 = Fixed(32)
var B64 = Fixed(64)
var U8 = Codec[int]{func(r *Reader) int { return int(r.Take(1)[0]) }, func(v int) []byte {
	RequireValue(v >= 0 && v <= 255)

	return []byte{byte(v)}
}}
var U32 = Codec[int]{func(r *Reader) int { return int(binary.BigEndian.Uint32(r.Take(4))) }, func(v int) []byte {
	RequireValue(v >= 0 && uint64(v) <= 0xffffffff)

	return binary.BigEndian.AppendUint32(nil, uint32(v))
}}
var U64 = Codec[uint64]{func(r *Reader) uint64 { return binary.BigEndian.Uint64(r.Take(8)) }, func(v uint64) []byte { return binary.BigEndian.AppendUint64(nil, v) }}

func Sized(limit int) Codec[[]byte] {
	return Codec[[]byte]{func(r *Reader) []byte {
		n := U32.Read(r)
		RequireValue(n <= limit, "Length limit")

		return r.Take(n)
	}, func(v []byte) []byte {
		RequireValue(len(v) <= limit, "Length limit")

		return Concat(U32.Write(len(v)), v)
	}}
}

var Bytes = Sized(65536)
var Blob = Sized(2 * 1024 * 1024)

func Encode[T any](c Codec[T], v T) ([]byte, error) { return Try(func() []byte { return c.Write(v) }) }

func Decode[T any](c Codec[T], data []byte) (T, error) {
	return Try(func() T {
		r := &Reader{Data: data}
		v := c.Read(r)
		r.End()

		return v
	})
}

func Tagged(tag int, r *Reader) {
	t, v := U8.Read(r), U8.Read(r)
	if t != tag || v != 1 {
		panic(e.New(e.UpdateRequired, "Unknown object format"))
	}
}

func Header(tag int) []byte { return []byte{byte(tag), 1} }

func NewCodec[T any](read func(*Reader) T, write func(T) []byte, validate func(T)) Codec[T] {
	return Codec[T]{func(r *Reader) T {
		v := read(r)
		if validate != nil {
			validate(v)
		}
		return v
	}, func(v T) []byte {
		if validate != nil {
			validate(v)
		}
		return write(v)
	}}

}
