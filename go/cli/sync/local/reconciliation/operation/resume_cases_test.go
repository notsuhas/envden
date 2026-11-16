package operation

import "testing"

func TestResumeMatrix(t *testing.T) {
	for _, tc := range []struct {
		written []bool
		current []string
		want    bool
	}{
		{[]bool{false, false}, []string{"old", "old"}, true},
		{[]bool{true, false}, []string{"next", "old"}, true},
		{[]bool{true, true}, []string{"next", "next"}, true},
		{[]bool{true, false}, []string{"old", "old"}, false},
		{[]bool{false, true}, []string{"next", "old"}, false},
		{[]bool{false, false}, []string{"edit", "old"}, false},
		{[]bool{false, false}, []string{"next", "old"}, true},
	} {
		if got := CanResume([]*string{hash("old"), hash("old")}, []*string{hash(tc.current[0]), hash(tc.current[1])}, hash("next"), tc.written); got != tc.want {
			t.Fatal(tc, got)
		}
	}
}
