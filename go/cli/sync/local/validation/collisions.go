package validation

import (
	"slices"
	"strings"
	"unicode/utf16"

	"github.com/notsuhas/envden/go/core/textcase"
	"golang.org/x/text/unicode/norm"
)

func PathCollisions(paths []string, insensitive bool) map[int]bool {
	spellings := map[string]string{}
	collisions := map[int]bool{}

	order := make([]int, len(paths))
	for i := range paths {
		order[i] = i
	}
	slices.SortFunc(order, func(a, b int) int {
		return slices.Compare(utf16.Encode([]rune(paths[a])), utf16.Encode([]rune(paths[b])))
	})

	for _, index := range order {
		path := paths[index]
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
