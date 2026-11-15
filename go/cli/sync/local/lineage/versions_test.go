package lineage

import "testing"

func TestPlaceVersions(t *testing.T) {
	a, b := "a", "b"
	for _, tc := range []struct {
		current, recorded *string
		accepted          bool
		want              string
	}{{&a, &a, true, "unchanged"}, {&b, &a, true, "edited"}, {&b, &b, false, "unaccepted"}, {nil, nil, true, "unchanged"}, {nil, &a, true, "edited"}} {
		if got := DerivePlaceVersion(tc.current, tc.recorded, tc.accepted); got != tc.want {
			t.Fatal(tc, got)
		}
	}
}
