package adapters

import "testing"

func TestMalformedGlobs(t *testing.T) {
	for _, r := range []struct {
		pattern, path string
		want          bool
	}{{"[", "[", false}, {"!.env{", "x", true}} {
		if got := globMatch(r.pattern, r.path); got != r.want {
			t.Errorf("%q %q = %v", r.pattern, r.path, got)
		}
	}
}
