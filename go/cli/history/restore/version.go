package restore

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

var versionPattern = regexp.MustCompile(`^v?([1-9][0-9]{0,15})$`)

func ParseVersion(value string) (uint64, error) {
	match := versionPattern.FindStringSubmatch(strings.TrimFunc(value, versionSpace))
	if match == nil {
		return 0, errors.New(errors.InvalidInput, "Version must be a number such as 3 or v3")
	}

	number, err := strconv.ParseUint(match[1], 10, 64)
	if err != nil {
		return 0, err
	}

	return uint64(float64(number)), nil
}

func versionSpace(r rune) bool {
	return r >= 9 && r <= 13 || r == 32 || r == 160 || r == 5760 || r >= 8192 && r <= 8202 || r == 8232 || r == 8233 || r == 8239 || r == 8287 || r == 12288 || r == 65279
}
