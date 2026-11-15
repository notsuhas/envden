package inputs

import "testing"

func TestInputs(t *testing.T) {
	for _, row := range []struct {
		kind, raw string
		valid     bool
	}{
		{"rename", `{"name":"x"}`, true}, {"rename", `{"name":""}`, false}, {"rename", `{"name":"x","unknown":0}`, false}, {"resolve", `{"id":"x","choice":"keep-mine"}`, true}, {"resolve", `{"id":"x","choice":"edit"}`, false}, {"file", `{"root":"/x","path":".env"}`, true}, {"file", `{"root":"relative","path":".env"}`, false}, {"restore", `{"root":"/x","path":".env","version":1}`, true}, {"restore", `{"root":"/x","path":".env","version":1.5}`, false}, {"restore", `{"root":"/x","path":".env","version":9007199254740992}`, false}, {"file", `null`, false},
	} {
		_, err := ParseInput(row.kind, []byte(row.raw))
		if (err == nil) != row.valid {
			t.Fatalf("%s %s: %v", row.kind, row.raw, err)
		}
	}
}
