package validation

import (
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

var reserved = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)`)

func Path(path string) {
	encoding.Str.Write(path)
	ok := path != "" && !strings.ContainsAny(path, `\:`)
	for _, s := range strings.Split(path, "/") {
		ok = ok && s != "" && s != "." && s != ".." && !strings.HasSuffix(s, ".") && !strings.HasSuffix(s, " ") && !reserved.MatchString(s)
	}
	encoding.RequireValue(ok, "Invalid relative path")
}
