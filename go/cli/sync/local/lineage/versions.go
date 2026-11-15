package lineage

func DerivePlaceVersion(current, recorded *string, ancestor bool) string {
	if !same(current, recorded) {
		return "edited"
	}
	if ancestor {
		return "unchanged"
	}

	return "unaccepted"
}

func same(a, b *string) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }
