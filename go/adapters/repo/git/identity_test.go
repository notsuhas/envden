package git

import "testing"

func TestCheckoutIdentityRoundsLikeNumber(t *testing.T) {
	if got := checkoutIdentity(1, 9007199254740993, "birth", 9007199254740995, "root"); got != "1:9007199254740992:birth:9007199254740996:root" {
		t.Fatal(got)
	}
}
