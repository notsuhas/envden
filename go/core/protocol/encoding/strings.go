package encoding

import (
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

func validString(s string) []byte {
	RequireValue(norm.NFC.IsNormalString(s), "Invalid string")
	for _, r := range s {
		RequireValue(!unicode.Is(unicode.Cc, r), "Invalid string")
	}
	RequireValue(utf8.ValidString(s), "Invalid Unicode")

	return []byte(s)
}

var Str = Codec[string]{func(r *Reader) string {
	b := Bytes.Read(r)
	RequireValue(utf8.Valid(b), "Invalid Unicode")
	v := string(b)
	validString(v)

	return v
}, func(v string) []byte { return Bytes.Write(validString(v)) }}

func Ctx(label string) []byte { return Str.Write("envden/v1/" + label) }

func NormPw(password string) (string, error) {
	return Try(func() string {
		p := norm.NFKC.String(password)
		RequireValue(len(p) > 0, "Empty password")

		return p
	})
}
