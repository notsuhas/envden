package validation

import (
	"strings"

	"github.com/notsuhas/envden/go/core/textcase"
	"golang.org/x/text/unicode/norm"
)

func PathCollisions(paths []string, insensitive bool) map[int]bool {
	spellings := map[string]string{}
	collisions := map[int]bool{}

	for index, path := range paths {
		parts := strings.Split(path, "/")

		for length := 1; length <= len(parts); length++ {
			prefix := strings.Join(parts[:length], "/")
			key := norm.NFC.String(prefix)

			if insensitive {
				key = textcase.Lower(key)
			}

			if previous, ok := spellings[key]; ok && previous != prefix {
				collisions[index] = true
			} else {
				spellings[key] = prefix
			}
		}
	}

	return collisions
}
