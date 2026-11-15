package versions

import (
	"math/big"
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

var semver = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

func IsSemver(v string) bool { return semver.MatchString(v) }

func ParseSemver(v string) ([3]*big.Int, error) {
	return encoding.Try(func() [3]*big.Int {
		encoding.RequireValue(IsSemver(v), "Invalid version")
		var out [3]*big.Int
		for i, s := range strings.Split(v, ".") {
			out[i], _ = new(big.Int).SetString(s, 10)
		}

		return out
	})
}

func CompareSemver(a, c string) (int, error) {
	return encoding.Try(func() int {
		aa := encoding.Must(ParseSemver(a))
		bb := encoding.Must(ParseSemver(c))
		for i := range aa {
			if n := aa[i].Cmp(bb[i]); n != 0 {
				return n
			}
		}

		return 0
	})
}
