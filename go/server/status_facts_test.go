package server

import (
	"regexp"
	"sort"
	"strings"
)

var (
	statusTags     = regexp.MustCompile(`(?s)<style.*?</style>|<[^>]+>`)
	statusVersions = regexp.MustCompile(`\d+\.\d+\.\d+`)
	statusWords    = regexp.MustCompile(`[a-z]{3,}`)
	statusUnits    = map[string]bool{"ago": true, "sec": true, "secs": true, "second": true, "seconds": true, "min": true, "mins": true, "minute": true, "minutes": true, "hour": true, "hours": true, "day": true, "days": true, "kib": true, "mib": true, "gib": true, "bytes": true, "utc": true}
)

// The status page is presentation: compare its versions and words, not its date and size formatting.
func statusPageFacts(page []byte) []string {
	text := strings.ToLower(statusTags.ReplaceAllString(string(page), " "))
	facts := statusVersions.FindAllString(text, -1)

	for _, word := range statusWords.FindAllString(text, -1) {
		if !statusUnits[word] {
			facts = append(facts, word)
		}
	}

	sort.Strings(facts)

	return facts
}
