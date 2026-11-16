package enginetest

import (
	"fmt"
	"os"
)

func sequences(alphabet []string, length int) [][]string {
	if length == 0 {
		return [][]string{{}}
	}

	result := [][]string{}

	for _, prefix := range sequences(alphabet, length-1) {
		for _, token := range alphabet {
			result = append(result, append(append([]string{}, prefix...), token))
		}
	}

	return result
}

func generatedTraces() []traceCase {
	alphabet := []string{"a", "r", "Al", "Be", "Br", "Bl", "Bs", "Bx", "Bf", "Bm", "Bk", "Bt", "Bu", "Bdel", "Bstore", "Bn", "Bq", "Btmp", "Bcorrupt", "Bv", "Br=earlier", "Bd", "Bd=zz", "Bz", "By", "Be1", "Br1", "Bf0", "Bz1", "By1", "Bv1"}
	layouts := [][]string{{"copy"}, {"copy", "copy"}, {"link"}, {"link", "copy"}}
	cases := []traceCase{}

	for _, layout := range layouts {
		for _, tokens := range sequences(alphabet[:13], 1) {
			cases = append(cases, traceCase{"exhaustive", layout, tokens})
		}
	}

	for _, tokens := range sequences(alphabet, 2) {
		cases = append(cases, traceCase{"exhaustive", []string{"copy", "link"}, tokens})
	}

	if os.Getenv("ENVDEN_DEEP_EXPLORATION") == "1" {
		cases = append(cases, randomTraces(600)...)

		for _, layout := range layouts {
			for _, tokens := range sequences([]string{"a", "Be", "Bx", "Bf"}, 4) {
				cases = append(cases, traceCase{"deep", layout, tokens})
			}
		}
	}

	return cases
}

func randomTraces(count int) []traceCase {
	seed := uint32(1)
	random := func(size int) int {
		seed = seed*1664525 + 1013904223

		return int(uint64(seed) * uint64(size) >> 32) //nolint:gosec // The generator receives only nonnegative slice lengths and small constants.
	}
	pick := func(items []string) string { return items[random(len(items))] }
	layouts := [][]string{{"copy"}, {"link"}, {"copy", "copy"}, {"copy", "link"}, {"link", "copy"}}
	result := []traceCase{}

	for i := 0; i < count; i++ {
		layout := layouts[random(len(layouts))]
		b := []string{"Be", "Be", "Br", "Bl", "Bs", "Bs", "Bx", "Bx", "Bf", "Bf", "Bm", "Bk", "Bt", "Bu"}

		if len(layout) > 1 {
			b = append(b, "Be1", "Br1", "Bf0", "Be1", "Bz1", "By1", "By1")
		}

		if layout[0] == "link" {
			b = append(b, "Bd", "Bd=zz")
		}

		a := []string{"Ae", "Ae", "Ar", "Al", "As", "As", "Ax", "Am", "Ak", "At", "a", "a", "r", "Ae=2", "Ar"}
		tokens := []string{}
		length := 5 + random(4)
		previous := ""

		for step := 0; step < length; step++ {
			token := ""

			if len(previous) > 1 && previous[0] == 'B' && (previous[1] == 'x' || previous[1] == 'f') {
				if random(4) != 0 {
					token = pick([]string{"a", "r", "a", "Ae", "As", "Al", "Ar"})
				} else {
					token = pick(b)
				}
			} else if random(3) != 0 {
				token = pick(b)
			} else {
				token = pick(a)
			}

			tokens = append(tokens, token)
			previous = token
		}

		result = append(result, traceCase{fmt.Sprintf("seed-1-%03d", i), layout, tokens})
	}

	return result
}
