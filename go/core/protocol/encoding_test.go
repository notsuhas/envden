package protocol_test

import (
	"bytes"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/versions"
)

func TestBinaryRejections(t *testing.T) {
	eq(t, encoding.U32.Write(0x01020304), []byte{1, 2, 3, 4})
	eq(t, must(encoding.Decode(encoding.U64, encoding.U64.Write(^uint64(0)))), ^uint64(0))
	for _, v := range []int{-1, 256} {
		_, err := encoding.Encode(encoding.U8, v)
		reject(t, err)
	}
	_, err := encoding.Encode(encoding.U32, 1<<32)
	reject(t, err)
	_, err = encoding.Encode(encoding.B16, make([]byte, 15))
	reject(t, err)
	_, err = encoding.Decode(encoding.U8, []byte{1, 2})
	reject(t, err)
	_, err = encoding.Decode(encoding.U32, make([]byte, 3))
	reject(t, err)
	for _, tc := range []struct {
		codec encoding.Codec[[]byte]
		limit int
	}{{encoding.Bytes, 65536}, {encoding.Blob, 2097152}} {
		_, err = encoding.Encode(tc.codec, make([]byte, tc.limit+1))
		reject(t, err)
		_, err = encoding.Decode(tc.codec, encoding.Concat(encoding.U32.Write(tc.limit+1), make([]byte, tc.limit+1)))
		reject(t, err)
	}
	_, err = encoding.Decode(encoding.Bytes, []byte{0, 0, 0, 2, 1})
	reject(t, err)
	_, err = encoding.Decode(encoding.Opt(encoding.U8), []byte{2})
	reject(t, err)
	eq(t, must(encoding.Decode(encoding.Opt(encoding.U8), []byte{0})), (*int)(nil))
	n := 3
	eq(t, must(encoding.Encode(encoding.Opt(encoding.U8), &n)), []byte{1, 3})
	count := 0
	counted := encoding.Codec[int]{Read: func(r *encoding.Reader) int {
		count++

		return encoding.U8.Read(r)
	}, Write: encoding.U8.Write}
	_, err = encoding.Decode(encoding.List(counted), encoding.Concat(encoding.U32.Write(100001), make([]byte, 100001)))
	reject(t, err)
	eq(t, count, 0)
	_, err = encoding.Encode(encoding.List(encoding.U8), make([]int, 100001))
	reject(t, err)
	ordered := encoding.List(encoding.U8, func(a, c int) int { return a - c })
	for _, v := range [][]int{{2, 1}, {1, 1}} {
		_, err = encoding.Encode(ordered, v)
		reject(t, err)
	}
	_, err = encoding.Decode(ordered, []byte{0, 0, 0, 2, 2, 1})
	reject(t, err)
	for _, s := range []string{"e\u0301", "a\n", "\x00", "\u0085", string([]byte{0xed, 0xa0, 0x80})} {
		_, err = encoding.Encode(encoding.Str, s)
		reject(t, err)
	}
	for _, v := range [][]byte{[]byte("\n"), []byte("\x00"), []byte("\u0085"), []byte("e\u0301"), {255}, {0xc0, 0x80}, {0xed, 0xa0, 0x80}, {0xe2}} {
		_, err = encoding.Decode(encoding.Str, encoding.Bytes.Write(v))
		reject(t, err)
	}
	for _, s := range []string{"é", "\uFEFFhello"} {
		eq(t, must(encoding.Decode(encoding.Str, must(encoding.Encode(encoding.Str, s)))), s)
	}
	eq(t, must(encoding.NormPw(" Ａ ")), " A ")
	_, err = encoding.NormPw("")
	reject(t, err)
}

func TestBase32PaddingAndVersions(t *testing.T) {
	for n := 0; n < 40; n++ {
		v := rng(n)
		eq(t, must(encoding.Unbase32(encoding.Base32(v))), v)
	}
	for _, s := range []string{"0", "000", "000000", "01", "0!", "OO", "ſ0"} {
		_, err := encoding.Unbase32(s)
		reject(t, err)
	}
	data := encoding.Pad(encoding.Bytes.Write([]byte{1}))
	eq(t, len(data), 256)
	eq(t, must(encoding.DecodePadded(encoding.Bytes, data)), []byte{1})
	bad := bytes.Clone(data)
	bad[255] = 1
	for _, v := range [][]byte{data[:255], bad, encoding.Concat(data, make([]byte, 256))} {
		_, err := encoding.DecodePadded(encoding.Bytes, v)
		reject(t, err)
	}
	eq(t, len(encoding.Pad(make([]byte, 256))), 256)
	eq(t, must(versions.CompareSemver("1.10.0", "1.2.0")), 1)
	eq(t, must(versions.CompareSemver("100000000000000000000.0.0", "99999999999999999999.0.0")), 1)
	for _, v := range []string{"1.2", "v1.2.3", "1.2.3-a", "-1.2.3", "01.2.3", "1.02.3", "1.2.03"} {
		eq(t, versions.IsSemver(v), false)
		_, err := versions.ParseSemver(v)
		reject(t, err)
	}
}
