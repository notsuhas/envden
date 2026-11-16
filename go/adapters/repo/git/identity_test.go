package git

import "testing"

func TestCheckoutIdentityRoundsLikeNumber(t *testing.T) {
	if got := checkoutIdentity(1, 9007199254740993, "birth", 9007199254740995, "root"); got != "1:9007199254740992:birth:9007199254740996:root" {
		t.Fatal(got)
	}
}

func TestCheckoutIdentityLargeNumbers(t *testing.T) {
	for _, row := range []struct {
		value uint64
		want  string
	}{{1 << 63, "9223372036854776000"}, {^uint64(0), "18446744073709552000"}, {12345678901234567890, "12345678901234567000"}} {
		if got := checkoutIdentity(row.value, row.value, "birth", row.value, "root"); got != row.want+":"+row.want+":birth:"+row.want+":root" {
			t.Fatal(got)
		}
	}
}
