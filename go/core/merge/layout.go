package merge

import (
	"bytes"
	"strings"
)

func lineEnding(files ...[]byte) string {
	for _, f := range files {
		i := bytes.IndexByte(f, 10)
		if i >= 0 {
			if i > 0 && f[i-1] == 13 {
				return "\r\n"
			}

			return "\n"
		}
	}

	return "\n"
}

func withLineEnding(raw []byte, ending string) []byte {
	return []byte(strings.ReplaceAll(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n", ending))
}

func commentOwners(entries []*Entry) map[string]map[string]bool {
	owners := map[string]map[string]bool{}
	for _, e := range entries {
		lines := strings.Split(strings.ReplaceAll(latin(e.Raw), "\r\n", "\n"), "\n")
		if lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
		if len(lines) > 0 {
			lines = lines[:len(lines)-1]
		}
		kept := []string{}
		for _, l := range lines {
			if trim(l) != "" {
				kept = append(kept, l)
			}
		}
		block := strings.Join(kept, "\n")
		if block == "" {
			continue
		}
		if owners[block] == nil {
			owners[block] = map[string]bool{}
		}
		owners[block][e.Key] = true
	}

	return owners
}

func layoutChanged(s sides) bool {
	b, l, r := s.files[0], s.files[1], s.files[2]
	bo, lo, ro := commentOwners(b.Entries), commentOwners(l.Entries), commentOwners(r.Entries)
	for block, keys := range bo {
		mine, theirs := lo[block], ro[block]
		if mine == nil || theirs == nil {
			continue
		}
		for key := range keys {
			if mine[key] || theirs[key] {
				continue
			}
			for owner := range mine {
				if !theirs[owner] {
					return true
				}
			}
		}
	}

	return (len(b.Tail) > 0 && !bytes.Equal(b.Tail, l.Tail) && !bytes.Equal(b.Tail, r.Tail)) || (!bytes.Equal(b.Tail, r.Tail) && !bytes.Equal(l.Tail, r.Tail))
}

func assembleLayout(s sides, selected map[string]*Entry, ending string, blocks map[string][]byte) []byte {
	b, l, r := s.files[0], s.files[1], s.files[2]
	known, placed := map[string]bool{}, map[string]bool{}
	for _, e := range b.Entries {
		known[e.Key] = true
	}
	for _, e := range l.Entries {
		known[e.Key] = true
		placed[e.Key] = true
	}
	parts := []byte{}
	appendPart := func(part []byte) {
		if len(part) == 0 {
			return
		}
		if len(parts) > 0 && parts[len(parts)-1] != 10 {
			parts = append(parts, ending...)
		}
		parts = append(parts, part...)
	}
	for _, e := range l.Entries {
		if block, ok := blocks[e.Key]; ok {
			appendPart(withLineEnding(block, ending))
		} else if chosen := selected[e.Key]; chosen != nil {
			raw := chosen.Raw
			if chosen != e {
				raw = withLineEnding(raw, ending)
			}
			appendPart(raw)
		}
	}
	appendPart(l.Tail)
	for _, e := range r.Entries {
		if !known[e.Key] {
			appendPart(withLineEnding(e.Raw, ending))
		}
	}
	for _, key := range s.keys {
		if block, ok := blocks[key]; ok && !placed[key] {
			appendPart(block)
		}
	}
	head := l.Head
	if bytes.Equal(b.Head, l.Head) {
		head = r.Head
	}

	return append(bytes.Clone(head), parts...)
}
