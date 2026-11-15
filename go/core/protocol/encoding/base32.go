package encoding

import "strings"

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

func Base32(data []byte) string {
	bits, value := 0, uint32(0)
	out := make([]byte, 0)
	for _, b := range data {
		value = value<<8 | uint32(b)
		bits += 8
		for bits >= 5 {
			bits -= 5
			out = append(out, alphabet[(value>>bits)&31])
		}
	}
	if bits > 0 {
		out = append(out, alphabet[(value<<(5-bits))&31])
	}
	return string(out)
}

func Unbase32(text string) ([]byte, error) {
	return Try(func() []byte {
		for _, c := range []byte(text) {
			RequireValue(c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z', "Invalid base32")
		}
		bits, value := 0, uint32(0)
		out := make([]byte, 0)
		for _, c := range strings.ToUpper(text) {
			n := strings.IndexRune(alphabet, c)
			RequireValue(n >= 0, "Invalid base32")
			value = value<<5 | uint32(n)
			bits += 5
			if bits >= 8 {
				bits -= 8
				out = append(out, byte(value>>bits))
			}
		}
		RequireValue(bits < 5 && (value&((1<<bits)-1)) == 0, "Noncanonical base32")

		return out
	})
}
