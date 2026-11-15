package release

import (
	e "github.com/notsuhas/envden/go/core/errors"
	"regexp"
	"strings"
)

var sumLine = regexp.MustCompile(`(?i)^([a-f0-9]{64}) [ *]([^\s\x{000b}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+)$`)

func ParseSha256Sums(contents string) (map[string]string, error) {
	hashes := map[string]string{}
	for _, line := range strings.Split(strings.TrimFunc(contents, jsSpace), "\n") {
		line = strings.TrimSuffix(line, "\r")
		m := sumLine.FindStringSubmatch(line)
		if m == nil {
			return nil, e.New(e.InvalidData, "Invalid SHA256SUMS entry")
		}
		if _, ok := hashes[m[2]]; ok {
			return nil, e.New(e.InvalidData, "Duplicate SHA256SUMS entry")
		}
		hashes[m[2]] = strings.ToLower(m[1])
	}
	return hashes, nil
}

func jsSpace(r rune) bool {
	return r == '\t' || r == '\n' || r == '\v' || r == '\f' || r == '\r' || r == ' ' || r == 0xa0 || r == 0x1680 || (r >= 0x2000 && r <= 0x200a) || r == 0x2028 || r == 0x2029 || r == 0x202f || r == 0x205f || r == 0x3000 || r == 0xfeff
}
