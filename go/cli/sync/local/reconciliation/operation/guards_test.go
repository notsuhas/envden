package operation

import "testing"

func hash(v string) *string { return &v }

func TestCanResume(t *testing.T) {
	for _, tc := range []struct {
		before, current []*string
		next            *string
		written         []bool
		want            bool
	}{
		{[]*string{hash("A"), hash("B")}, []*string{hash("A"), hash("B")}, hash("N"), nil, true},
		{[]*string{hash("A"), hash("B")}, []*string{hash("N"), hash("B")}, hash("N"), []bool{true, false}, true},
		{[]*string{hash("A")}, []*string{hash("A")}, hash("N"), []bool{true}, false},
		{[]*string{hash("A")}, []*string{hash("edit")}, hash("N"), nil, false},
		{[]*string{hash("A")}, nil, hash("N"), nil, false},
		{[]*string{hash("A")}, []*string{nil}, nil, []bool{true}, true},
	} {
		if got := CanResume(tc.before, tc.current, tc.next, tc.written); got != tc.want {
			t.Fatal(tc, got)
		}
	}

	if ContentHash(nil) != nil || ContentHash([]byte{}) == nil {
		t.Fatal("absence must have a distinct hash")
	}
}
