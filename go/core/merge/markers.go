package merge

import (
	"bytes"
	"regexp"
)

var labelBreaks = regexp.MustCompile(`[\r\n]+`)

func markerBlock(mine, theirs []byte, labels Labels, ending string) []byte {
	out := []byte("<<<<<<< " + labelBreaks.ReplaceAllString(labels.Mine, " ") + ending)
	for i, p := range [][]byte{mine, theirs} {
		out = append(out, p...)
		if len(p) > 0 && p[len(p)-1] != 10 {
			out = append(out, ending...)
		}
		if i == 0 {
			out = append(out, "======="+ending...)
		}
	}

	return append(out, ">>>>>>> "+labelBreaks.ReplaceAllString(labels.Theirs, " ")+ending...)
}

func MarkConflicts(base, local, remote []byte, labels Labels) Result {
	ending := lineEnding(local, remote)
	if base != nil {
		s, f := parseSides(base, local, remote)
		if f.Kind != "conflict" && !layoutChanged(s) {
			selected := map[string]*Entry{}
			blocks := map[string][]byte{}
			keys := []string{}
			for _, key := range s.keys {
				l, r := s.entries[1][key], s.entries[2][key]
				result := selectEntry(key, s.entries[0][key], l, r)
				if result.Kind == "conflict" {
					var mine, theirs []byte
					if l != nil {
						mine = l.Raw
					}
					if r != nil {
						theirs = withLineEnding(r.Raw, ending)
					}
					blocks[key] = markerBlock(mine, theirs, labels, ending)
					keys = append(keys, key)
				} else if result.entry != nil {
					selected[key] = result.entry
				}
			}
			if len(keys) > 0 {
				return Result{Kind: "keys", Bytes: assembleLayout(s, selected, ending, blocks), Keys: keys}
			}
		}
	}

	return Result{Kind: "file", Bytes: markerBlock(local, remote, labels, ending)}
}

func HasConflictMarkers(raw []byte) bool {
	for _, line := range bytes.FieldsFunc(raw, func(r rune) bool { return r == '\n' || r == '\r' }) {
		if len(line) < 7 {
			continue
		}
		prefix := string(line[:7])
		if prefix != "<<<<<<<" && prefix != "=======" && prefix != ">>>>>>>" {
			continue
		}
		if len(line) == 7 {
			return true
		}
		c := line[7]
		if c == ' ' || c == '\t' || c == '\v' || c == '\f' || c == 160 {
			return true
		}
	}

	return false
}
