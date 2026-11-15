package server

import (
	e "github.com/notsuhas/envden/go/core/errors"
	x "github.com/notsuhas/envden/go/server/shared"
	"math/big"
	"strings"
)

func parseSequence(raw string) uint64 {
	raw = strings.Trim(raw, "\t\n\v\f\r \u00a0\ufeff\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000")
	if raw == "" {
		return 0
	}
	base := 10
	if len(raw) > 2 && raw[0] == '0' {
		switch raw[1] {
		case 'x', 'X':
			base = 16
		case 'b', 'B':
			base = 2
		case 'o', 'O':
			base = 8
		}
		if base != 10 {
			raw = raw[2:]
			if strings.HasPrefix(raw, "+") || strings.HasPrefix(raw, "-") {
				x.Fail(e.InvalidInput, "Invalid range")
			}
		}
	}
	if strings.Contains(raw, "_") {
		x.Fail(e.InvalidInput, "Invalid range")
	}
	value, ok := new(big.Int).SetString(raw, base)
	if !ok || value.Sign() < 0 || value.BitLen() > 64 {
		x.Fail(e.InvalidInput, "Invalid range")
	}
	return value.Uint64()
}
