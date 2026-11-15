package merge

import "bytes"

func MergeEnv(base, local, remote []byte) Result {
	if bytes.Equal(base, local) {
		return shortcut(base, remote)
	}
	if bytes.Equal(base, remote) || bytes.Equal(local, remote) {
		return shortcut(base, local)
	}
	s, f := parseSides(base, local, remote)
	if f.Kind == "conflict" {
		return f
	}
	selected := map[string]*Entry{}
	changed := []string{}
	for _, key := range s.keys {
		result := selectEntry(key, s.entries[0][key], s.entries[1][key], s.entries[2][key])
		if result.Kind == "conflict" {
			return result.Result
		}
		if result.changed {
			changed = append(changed, key)
		}
		if result.entry != nil {
			selected[key] = result.entry
		}
	}
	if layoutChanged(s) {
		return conflict("layout-change", "")
	}
	return Result{Kind: "clean", Bytes: assembleLayout(s, selected, lineEnding(local, base, remote), nil), ChangedKeys: changed}
}
func shortcut(base, chosen []byte) Result {
	changed := []string{}
	b, a := ParseEnv(base), ParseEnv(chosen)
	if b.Kind == "parsed" && a.Kind == "parsed" {
		bm, am := map[string]*Entry{}, map[string]*Entry{}
		keys := []string{}
		for _, e := range b.Entries {
			bm[e.Key] = e
			keys = append(keys, e.Key)
		}
		for _, e := range a.Entries {
			am[e.Key] = e
			if bm[e.Key] == nil {
				keys = append(keys, e.Key)
			}
		}
		for _, k := range keys {
			if !equalEntry(bm[k], am[k]) {
				changed = append(changed, k)
			}
		}
	}
	return Result{Kind: "clean", Bytes: bytes.Clone(chosen), ChangedKeys: changed}
}
func DiffEnvKeys(before, after []byte) Result {
	a, b := ParseEnv(before), ParseEnv(after)
	if a.Kind == "conflict" {
		return a
	}
	if b.Kind == "conflict" {
		return b
	}
	old, next := map[string]*Entry{}, map[string]*Entry{}
	for _, e := range a.Entries {
		old[e.Key] = e
	}
	for _, e := range b.Entries {
		next[e.Key] = e
	}
	result := Result{Kind: "diff", Added: []string{}, Removed: []string{}, Changed: []string{}}
	for _, e := range b.Entries {
		if old[e.Key] == nil {
			result.Added = append(result.Added, e.Key)
		} else if !equalEntry(old[e.Key], e) {
			result.Changed = append(result.Changed, e.Key)
		}
	}
	for _, e := range a.Entries {
		if next[e.Key] == nil {
			result.Removed = append(result.Removed, e.Key)
		}
	}
	return result
}
