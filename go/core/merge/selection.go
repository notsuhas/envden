package merge

import "bytes"

type selection struct {
	Result
	changed bool
	entry   *Entry
}

func entryBytes(e *Entry) []byte {
	if e == nil {
		return nil
	}
	raw := e.Raw
	if len(raw) > 0 && raw[len(raw)-1] == 10 {
		raw = raw[:len(raw)-1]
		if len(raw) > 0 && raw[len(raw)-1] == 13 {
			raw = raw[:len(raw)-1]
		}
	}

	return raw
}

func equalEntry(a, b *Entry) bool {
	return (a == nil) == (b == nil) && bytes.Equal(entryBytes(a), entryBytes(b))
}

func styleChanged(a, b *Entry) bool {
	return a != nil && b != nil && (a.Exported != b.Exported || a.Quote != b.Quote)
}

func selectEntry(key string, b, l, r *Entry) selection {
	lc, rc := !equalEntry(b, l), !equalEntry(b, r)
	if lc && rc && equalEntry(l, r) {
		return selection{Result: Result{Kind: "selected"}, changed: true, entry: l}
	}
	reason := ""
	if styleChanged(b, l) || styleChanged(b, r) {
		reason = "style-change"
	} else if lc && rc {
		if l == nil || r == nil {
			reason = "delete-vs-edit"
		} else if b != nil && (b.Active != l.Active || b.Active != r.Active) {
			reason = "comment-toggle-vs-edit"
		} else {
			reason = "both-changed"
		}
	}
	if reason != "" {
		return selection{Result: conflict(reason, key)}
	}
	e := l
	if rc {
		e = r
	}

	return selection{Result: Result{Kind: "selected"}, changed: lc || rc, entry: e}
}

type sides struct {
	files   [3]Result
	keys    []string
	entries [3]map[string]*Entry
}

func parseSides(b, l, r []byte) (s sides, failure Result) {
	seen := map[string]bool{}
	for i, raw := range [][]byte{b, l, r} {
		f := ParseEnv(raw)
		if f.Kind == "conflict" {
			return s, f
		}
		s.files[i] = f
		s.entries[i] = map[string]*Entry{}
		for _, e := range f.Entries {
			s.entries[i][e.Key] = e
			if !seen[e.Key] {
				seen[e.Key] = true
				s.keys = append(s.keys, e.Key)
			}
		}
	}

	return s, Result{}
}
