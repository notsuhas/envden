package server

import "testing"

func TestBigIntRanges(t *testing.T) {
	for _, row := range []struct {
		raw  string
		want uint64
	}{{"", 0}, {" 08 ", 8}, {"+10", 10}, {"-0", 0}, {"0x10", 16}, {"0o10", 8}, {"0b10", 2}, {"18446744073709551615", ^uint64(0)}} {
		if got := parseSequence(row.raw); got != row.want {
			t.Fatal(row, got)
		}
	}
	for _, raw := range []string{"1_0", "1.0", "-1", "1e3", "18446744073709551616"} {
		func() {
			defer func() {
				if recover() == nil {
					t.Error("accepted", raw)
				}
			}()
			parseSequence(raw)
		}()
	}
}
