package commander

import (
	"sort"
	"strings"
)

func suggest(word string, candidates []string) string {
	options := strings.HasPrefix(word, "--")
	if options {
		word = word[2:]
	}
	best := 3
	var matches []string
	for _, candidate := range candidates {
		if options {
			candidate = strings.TrimPrefix(candidate, "--")
		}
		if len(candidate) <= 1 {
			continue
		}
		distance := editDistance(word, candidate)
		if float64(max(len(word), len(candidate))-distance)/float64(max(len(word), len(candidate))) <= 0.4 {
			continue
		}
		if distance < best {
			best = distance
			matches = []string{candidate}
		} else if distance == best && !contains(matches, candidate) {
			matches = append(matches, candidate)
		}
	}
	sort.Strings(matches)
	if options {
		for i := range matches {
			matches[i] = "--" + matches[i]
		}
	}
	if len(matches) == 1 {
		return "\n(Did you mean " + matches[0] + "?)"
	}
	if len(matches) > 1 {
		return "\n(Did you mean one of " + strings.Join(matches, ", ") + "?)"
	}

	return ""
}

func editDistance(a, b string) int {
	d := make([][]int, len(a)+1)
	for i := range d {
		d[i] = make([]int, len(b)+1)
		d[i][0] = i
	}
	for j := range d[0] {
		d[0][j] = j
	}
	for j := 1; j <= len(b); j++ {
		for i := 1; i <= len(a); i++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost)
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
				d[i][j] = min(d[i][j], d[i-2][j-2]+1)
			}
		}
	}

	return d[len(a)][len(b)]
}
