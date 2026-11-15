package protocol_test

import (
	"bytes"
	"testing"

	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/versions"
)

func TestBinaryRejections(t *testing.T) {
	eq(t, b.U32.Write(0x01020304), []byte{1, 2, 3, 4})
	eq(t, must(b.Decode(b.U64, b.U64.Write(^uint64(0)))), ^uint64(0))
	for _, v := range []int{-1, 256} {
		_, err := b.Encode(b.U8, v)
		reject(t, err)
	}
	_, err := b.Encode(b.U32, 1<<32)
	reject(t, err)
	_, err = b.Encode(b.B16, make([]byte, 15))
	reject(t, err)
	_, err = b.Decode(b.U8, []byte{1, 2})
	reject(t, err)
	_, err = b.Decode(b.U32, make([]byte, 3))
	reject(t, err)
	for _, tc := range []struct {
		codec b.Codec[[]byte]
		limit int
	}{{b.Bytes, 65536}, {b.Blob, 2097152}} {
		_, err = b.Encode(tc.codec, make([]byte, tc.limit+1))
		reject(t, err)
		_, err = b.Decode(tc.codec, b.Concat(b.U32.Write(tc.limit+1), make([]byte, tc.limit+1)))
		reject(t, err)
	}
	_, err = b.Decode(b.Bytes, []byte{0, 0, 0, 2, 1})
	reject(t, err)
	_, err = b.Decode(b.Opt(b.U8), []byte{2})
	reject(t, err)
	eq(t, must(b.Decode(b.Opt(b.U8), []byte{0})), (*int)(nil))
	n := 3
	eq(t, must(b.Encode(b.Opt(b.U8), &n)), []byte{1, 3})
	count := 0
	counted := b.Codec[int]{Read: func(r *b.Reader) int {
		count++

		return b.U8.Read(r)
	}, Write: b.U8.Write}
	_, err = b.Decode(b.List(counted), b.Concat(b.U32.Write(100001), make([]byte, 100001)))
	reject(t, err)
	eq(t, count, 0)
	_, err = b.Encode(b.List(b.U8), make([]int, 100001))
	reject(t, err)
	ordered := b.List(b.U8, func(a, c int) int { return a - c })
	for _, v := range [][]int{{2, 1}, {1, 1}} {
		_, err = b.Encode(ordered, v)
		reject(t, err)
	}
	_, err = b.Decode(ordered, []byte{0, 0, 0, 2, 2, 1})
	reject(t, err)
	for _, s := range []string{"e\u0301", "a\n", "\x00", "\u0085", string([]byte{0xed, 0xa0, 0x80})} {
		_, err = b.Encode(b.Str, s)
		reject(t, err)
	}
	for _, v := range [][]byte{[]byte("\n"), []byte("\x00"), []byte("\u0085"), []byte("e\u0301"), {255}, {0xc0, 0x80}, {0xed, 0xa0, 0x80}, {0xe2}} {
		_, err = b.Decode(b.Str, b.Bytes.Write(v))
		reject(t, err)
	}
	for _, s := range []string{"é", "\uFEFFhello"} {
		eq(t, must(b.Decode(b.Str, must(b.Encode(b.Str, s)))), s)
	}
	eq(t, must(b.NormPw(" Ａ ")), " A ")
	_, err = b.NormPw("")
	reject(t, err)
}

func TestBase32PaddingAndVersions(t *testing.T) {
	for n := 0; n < 40; n++ {
		v := rng(n)
		eq(t, must(b.Unbase32(b.Base32(v))), v)
	}
	for _, s := range []string{"0", "000", "000000", "01", "0!", "OO", "ſ0"} {
		_, err := b.Unbase32(s)
		reject(t, err)
	}
	data := b.Pad(b.Bytes.Write([]byte{1}))
	eq(t, len(data), 256)
	eq(t, must(b.DecodePadded(b.Bytes, data)), []byte{1})
	bad := bytes.Clone(data)
	bad[255] = 1
	for _, v := range [][]byte{data[:255], bad, b.Concat(data, make([]byte, 256))} {
		_, err := b.DecodePadded(b.Bytes, v)
		reject(t, err)
	}
	eq(t, len(b.Pad(make([]byte, 256))), 256)
	eq(t, must(versions.CompareSemver("1.10.0", "1.2.0")), 1)
	eq(t, must(versions.CompareSemver("100000000000000000000.0.0", "99999999999999999999.0.0")), 1)
	for _, v := range []string{"1.2", "v1.2.3", "1.2.3-a", "-1.2.3", "01.2.3", "1.02.3", "1.2.03"} {
		eq(t, versions.IsSemver(v), false)
		_, err := versions.ParseSemver(v)
		reject(t, err)
	}
}
