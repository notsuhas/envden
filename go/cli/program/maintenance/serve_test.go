package maintenance

import "testing"

func TestParsePort(t *testing.T) {
	for _, r := range []struct {
		value string
		port  int
		valid bool
	}{{"0", 0, true}, {"4280", 4280, true}, {"65535", 65535, true}, {"00000", 0, true}, {"65536", 0, false}, {"100000", 0, false}, {"-1", 0, false}, {"1e2", 0, false}, {" 80", 0, false}, {"", 0, false}} {
		port, e := ParsePort(r.value)
		if (e == nil) != r.valid || r.valid && port != r.port {
			t.Fatal(r, port, e)
		}
		if e != nil && e.Error() != "Expected a port from 0 (any free port) to 65535." {
			t.Fatal(e)
		}
	}
}
